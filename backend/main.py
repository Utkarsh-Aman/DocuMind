import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
import uvicorn

from src.data_loader import load_document
from src.embedding import EmbeddingPipeline
from src.search import RAGSearch
from src.database.connection import get_db
from src.database.models import User, Document
from src.auth.google_auth import verify_google_token
from src.auth.jwt_auth import create_access_token
from src.auth.dependencies import get_current_user

app = FastAPI(
    title="DocuMind API",
    description="Secure multi-user RAG API with Document Isolation & Google OAuth"
)

# CORS configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://documind-lyart.vercel.app"
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize global RAG components
rag_search = RAGSearch(persist_dir="chroma_db")
embedding_pipe = EmbeddingPipeline(chunk_size=1000, chunk_overlap=200)

# Pydantic Schemas for Validation
class GoogleLoginRequest(BaseModel):
    id_token: str

class ChatRequest(BaseModel):
    query: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str | None = None
    picture_url: str | None = None

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: int
    filename: str
    upload_timestamp: str
    status: str

    class Config:
        from_attributes = True


# ==========================================
# AUTHENTICATION ROUTES
# ==========================================

@app.post("/api/auth/google")
async def google_auth(req: GoogleLoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Endpoint called by the client upon receiving a Google OAuth ID token.
    Verifies the ID token, creates the user if they do not exist,
    generates a custom JWT, sets it in an HttpOnly cookie, and returns user profile.
    """
    try:
        # 1. Verify Google ID Token
        idinfo = verify_google_token(req.id_token)
        google_email = idinfo.get("email")
        google_name = idinfo.get("name")
        google_picture = idinfo.get("picture")
        
        if not google_email:
            raise HTTPException(status_code=400, detail="Google token does not contain a valid email.")
            
        # 2. Find or create User in PostgreSQL
        user = db.query(User).filter(User.email == google_email).first()
        if not user:
            user = User(
                email=google_email,
                name=google_name,
                picture_url=google_picture
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"[INFO] Created new user: {google_email} (ID: {user.id})")
        else:
            # Optionally update name and picture if they changed
            user.name = google_name
            user.picture_url = google_picture
            db.commit()
            db.refresh(user)
            print(f"[INFO] Logged in existing user: {google_email} (ID: {user.id})")
            
        # 3. Create access token containing the DB User ID
        access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
        
        # 4. Set HttpOnly cookie on the response
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            samesite="lax",
            secure=False,  # Set to True in production (requires HTTPS)
            path="/",
            max_age=60 * 24 * 7 * 60, # 7 Days
        )
        
        return {
            "status": "success",
            "access_token": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "picture_url": user.picture_url
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        import traceback
        print(f"[ERROR] Exception during Google login: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error during authentication: {str(e)}")

@app.post("/api/auth/logout")
async def logout(response: Response):
    """
    Clears the access_token HttpOnly cookie, signing out the user.
    """
    response.delete_cookie(
        key="access_token",
        path="/",
        samesite="lax",
    )
    return {"status": "success", "detail": "Successfully logged out."}

@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns profile information of the currently authenticated user.
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture_url": current_user.picture_url,
        "created_at": current_user.created_at.isoformat()
    }


# ==========================================
# DOCUMENT MANAGEMENT ROUTES
# ==========================================

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Processes and ingests a file, writing the record to Postgres and 
    chunks to ChromaDB with user_id and document_id metadata for isolation.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
        
    temp_path = os.path.join(TEMP_DIR, file.filename)
    
    # 1. Create a Document record in PostgreSQL with status='processing'
    document = Document(
        user_id=current_user.id,
        filename=file.filename,
        status="processing"
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    
    try:
        # Save file locally for processing
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"[INFO] File saved to {temp_path} for user: {current_user.email}")
        
        # 2. Load and parse document
        docs = load_document(temp_path)
        if not docs:
            document.status = "error"
            db.commit()
            raise HTTPException(status_code=422, detail="Failed to parse document content.")
            
        # 3. Chunk document
        chunks = embedding_pipe.chunk_documents(docs)
        if not chunks:
            document.status = "error"
            db.commit()
            raise HTTPException(status_code=422, detail="Document produced no text chunks.")
            
        # 4. Enrich chunk metadata with isolation details
        for chunk in chunks:
            chunk.metadata["user_id"] = str(current_user.id)
            chunk.metadata["document_id"] = str(document.id)
            chunk.metadata["filename"] = file.filename
            
        # 5. Store in ChromaDB
        rag_search.vectorstore.add_documents(chunks)
        
        # 6. Update status to 'active'
        document.status = "active"
        db.commit()
        db.refresh(document)
        
        return {
            "status": "success",
            "document_id": document.id,
            "filename": document.filename,
            "num_chunks": len(chunks)
        }
    except Exception as e:
        print(f"[ERROR] Ingestion exception: {e}")
        document.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.get("/api/documents")
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns a list of all documents belonging to the currently authenticated user.
    """
    docs = db.query(Document).filter(Document.user_id == current_user.id).order_by(Document.upload_timestamp.desc()).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "upload_timestamp": d.upload_timestamp.isoformat(),
            "status": d.status
        }
        for d in docs
    ]

@app.delete("/api/documents/{document_id}")
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Removes document metadata from PostgreSQL and all corresponding chunks from Chroma DB.
    """
    # 1. Fetch document and verify ownership
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found or access denied.")
        
    try:
        # 2. Delete document chunks from Chroma
        rag_search.vectorstore.delete_document_chunks(
            user_id=current_user.id,
            document_id=document_id
        )
        
        # 3. Delete from PostgreSQL
        db.delete(document)
        db.commit()
        
        return {"status": "success", "detail": f"Successfully deleted document '{document.filename}'."}
    except Exception as e:
        print(f"[ERROR] Exception during document deletion: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")


# ==========================================
# RAG WORKSPACE ROUTES
# ==========================================

@app.post("/api/chat")
async def chat_query(req: ChatRequest, current_user: User = Depends(get_current_user)):
    """
    Answers user queries by performing context searches restricted to the user's isolated documents.
    """
    if not req.query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    try:
        # Perform retrieval passing the user_id for strict metadata filtering
        result = rag_search.search_and_summarize(req.query, user_id=current_user.id, top_k=5)
        return result
    except Exception as e:
        import traceback
        print(f"[ERROR] Chat query exception: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error retrieving context or querying LLM: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
