import os
import json
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Response, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
import uvicorn

from src.data_loader import load_document
from src.embedding import EmbeddingPipeline
from src.vectorstore import ChromaStore
from src.database.connection import get_db
from src.database.models import User, Document, Chat, Message
from src.auth.google_auth import verify_google_token
from src.auth.jwt_auth import create_access_token
from src.auth.dependencies import get_current_user

# Import our new V2.20 RAG modules
from src.rag.intent_router import is_greeting
from src.rag.retriever import HybridRetriever
from src.rag.generator import generate_streaming_answer, generate_answer, build_citations

# ---------------------------------------------------------------------------
# APP SETUP
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DocuMind API",
    description="Secure multi-user RAG API — V2.20 with streaming, history & hybrid search"
)

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

# Initialize global components (created once at startup)
chroma_store    = ChromaStore(persist_dir="chroma_db")
hybrid_retriever = HybridRetriever(vectorstore=chroma_store)
embedding_pipe   = EmbeddingPipeline(chunk_size=1000, chunk_overlap=200)


# ---------------------------------------------------------------------------
# PYDANTIC SCHEMAS (request / response validation)
# ---------------------------------------------------------------------------

class GoogleLoginRequest(BaseModel):
    id_token: str

class ChatRequest(BaseModel):
    query      : str
    chat_id    : Optional[int] = None   # If None, a new chat session is created
    debug_mode : bool = False           # Set True to see retrieval scores in response

class UserResponse(BaseModel):
    id          : int
    email       : str
    name        : Optional[str] = None
    picture_url : Optional[str] = None

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id               : int
    filename         : str
    upload_timestamp : str
    status           : str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------------------------

def get_recent_history(db: Session, chat_id: int, limit: int = 8) -> List[dict]:
    """
    Fetch the last `limit` messages from a chat and return them as a list
    of {"role": "user"/"assistant", "content": "..."} dicts.

    We only pass the recent messages to the LLM to keep the context window small.
    """
    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())  # newest first
        .limit(limit)
        .all()
    )
    # Reverse so oldest-first order for the LLM prompt
    messages.reverse()
    return [{"role": msg.role, "content": msg.content} for msg in messages]


def save_messages(db: Session, chat_id: int, user_query: str, assistant_answer: str, citations: list):
    """
    Save the user's question and the assistant's answer to the messages table.
    Called as a background task after streaming completes.
    """
    # Save user message
    db.add(Message(chat_id=chat_id, role="user", content=user_query, sources=[]))

    # Save assistant message with citations
    db.add(Message(chat_id=chat_id, role="assistant", content=assistant_answer, sources=citations))

    db.commit()
    print(f"[INFO] Saved messages to chat_id={chat_id}")


# ---------------------------------------------------------------------------
# AUTHENTICATION ROUTES
# ---------------------------------------------------------------------------

@app.post("/api/auth/google")
async def google_auth(req: GoogleLoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Called by the client after receiving a Google OAuth ID token.
    Verifies the token, creates the user if new, generates a JWT,
    sets it as an HttpOnly cookie, and returns user profile.
    """
    try:
        idinfo = verify_google_token(req.id_token)
        google_email   = idinfo.get("email")
        google_name    = idinfo.get("name")
        google_picture = idinfo.get("picture")

        if not google_email:
            raise HTTPException(status_code=400, detail="Google token does not contain a valid email.")

        # Find or create the user
        user = db.query(User).filter(User.email == google_email).first()
        if not user:
            user = User(email=google_email, name=google_name, picture_url=google_picture)
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"[INFO] Created new user: {google_email} (ID: {user.id})")
        else:
            user.name        = google_name
            user.picture_url = google_picture
            db.commit()
            db.refresh(user)
            print(f"[INFO] Logged in existing user: {google_email} (ID: {user.id})")

        # Create JWT and set it as a cookie
        access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
        response.set_cookie(
            key      = "access_token",
            value    = access_token,
            httponly = True,
            samesite = "lax",
            secure   = False,   # Set True in production (needs HTTPS)
            path     = "/",
            max_age  = 60 * 24 * 7 * 60,  # 7 days
        )

        return {
            "status"       : "success",
            "access_token" : access_token,
            "user"         : {
                "id"          : user.id,
                "email"       : user.email,
                "name"        : user.name,
                "picture_url" : user.picture_url,
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Auth error: {str(e)}")


@app.post("/api/auth/logout")
async def logout(response: Response):
    """Clear the access_token cookie, signing the user out."""
    response.delete_cookie(key="access_token", path="/", samesite="lax")
    return {"status": "success", "detail": "Successfully logged out."}


@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return profile info for the currently authenticated user."""
    return {
        "id"         : current_user.id,
        "email"      : current_user.email,
        "name"       : current_user.name,
        "picture_url": current_user.picture_url,
        "created_at" : current_user.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# DOCUMENT MANAGEMENT ROUTES
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_file(
    file         : UploadFile = File(...),
    current_user : User       = Depends(get_current_user),
    db           : Session    = Depends(get_db)
):
    """
    Upload a file. Stores metadata in Postgres, embeddings in ChromaDB.
    The raw PDF is NOT stored in the database (Goal 9).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    temp_path = os.path.join(TEMP_DIR, file.filename)

    # Create a Postgres record immediately so the user sees upload progress
    document = Document(user_id=current_user.id, filename=file.filename, status="processing")
    db.add(document)
    db.commit()
    db.refresh(document)

    try:
        # Save temp file for processing
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"[INFO] Saved temp file: {temp_path}")

        # Parse document
        docs = load_document(temp_path)
        if not docs:
            document.status = "error"
            db.commit()
            raise HTTPException(status_code=422, detail="Failed to parse document content.")

        # Chunk document
        chunks = embedding_pipe.chunk_documents(docs)
        if not chunks:
            document.status = "error"
            db.commit()
            raise HTTPException(status_code=422, detail="Document produced no text chunks.")

        # Tag each chunk with user & document metadata for filtering in ChromaDB
        for chunk in chunks:
            chunk.metadata["user_id"]     = str(current_user.id)
            chunk.metadata["document_id"] = str(document.id)
            chunk.metadata["filename"]    = file.filename

        # Store chunks in ChromaDB
        chroma_store.add_documents(chunks)

        # Mark as active
        document.status = "active"
        db.commit()
        db.refresh(document)

        return {
            "status"      : "success",
            "document_id" : document.id,
            "filename"    : document.filename,
            "num_chunks"  : len(chunks)
        }

    except Exception as e:
        print(f"[ERROR] Ingestion error: {e}")
        document.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/api/documents")
async def list_documents(
    current_user : User    = Depends(get_current_user),
    db           : Session = Depends(get_db)
):
    """Return all documents for the currently logged-in user."""
    docs = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.upload_timestamp.desc())
        .all()
    )
    return [
        {
            "id"               : d.id,
            "filename"         : d.filename,
            "upload_timestamp" : d.upload_timestamp.isoformat(),
            "status"           : d.status,
        }
        for d in docs
    ]


@app.delete("/api/documents/{document_id}")
async def delete_document(
    document_id  : int,
    current_user : User    = Depends(get_current_user),
    db           : Session = Depends(get_db)
):
    """Delete a document's metadata from Postgres and its chunks from ChromaDB."""
    document = db.query(Document).filter(
        Document.id      == document_id,
        Document.user_id == current_user.id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found or access denied.")

    try:
        chroma_store.delete_document_chunks(user_id=current_user.id, document_id=document_id)
        db.delete(document)
        db.commit()
        return {"status": "success", "detail": f"Deleted '{document.filename}'."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")


# ---------------------------------------------------------------------------
# CHAT MANAGEMENT ROUTES
# ---------------------------------------------------------------------------

@app.post("/api/chats")
async def create_chat(
    current_user : User    = Depends(get_current_user),
    db           : Session = Depends(get_db)
):
    """Create a new empty chat session for the user."""
    chat = Chat(user_id=current_user.id, title="New Chat")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {"chat_id": chat.id, "title": chat.title, "created_at": chat.created_at.isoformat()}


@app.get("/api/chats")
async def list_chats(
    current_user : User    = Depends(get_current_user),
    db           : Session = Depends(get_db)
):
    """Return all chat sessions for the currently logged-in user."""
    chats = (
        db.query(Chat)
        .filter(Chat.user_id == current_user.id)
        .order_by(Chat.created_at.desc())
        .all()
    )
    return [{"chat_id": c.id, "title": c.title, "created_at": c.created_at.isoformat()} for c in chats]


@app.get("/api/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id      : int,
    current_user : User    = Depends(get_current_user),
    db           : Session = Depends(get_db)
):
    """Return all messages in a specific chat (for loading conversation history in the UI)."""
    # Verify ownership
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found or access denied.")

    messages = db.query(Message).filter(Message.chat_id == chat_id).order_by(Message.created_at).all()
    return [
        {
            "id"      : m.id,
            "role"    : m.role,
            "content" : m.content,
            "sources" : m.sources,
        }
        for m in messages
    ]


@app.delete("/api/chats/{chat_id}")
async def delete_chat(
    chat_id      : int,
    current_user : User    = Depends(get_current_user),
    db           : Session = Depends(get_db)
):
    """Delete a chat and all its messages."""
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found or access denied.")

    db.delete(chat)
    db.commit()
    return {"status": "success", "detail": f"Deleted chat {chat_id}."}


# ---------------------------------------------------------------------------
# MAIN CHAT / RAG ROUTE — V2.20
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat_query(
    req              : ChatRequest,
    background_tasks : BackgroundTasks,
    current_user     : User    = Depends(get_current_user),
    db               : Session = Depends(get_db)
):
    """
    Main RAG endpoint. Streams the answer token by token using Server-Sent Events.

    Pipeline:
        1. Get or create a chat session in Postgres.
        2. Detect if the query is a greeting → skip retrieval, answer conversationally.
        3. Run Hybrid Retrieval (vector + BM25).
        4. Check relevance threshold → return graceful message if below threshold.
        5. Build context from top chunks.
        6. Stream LLM answer token by token to the frontend.
        7. Save question + answer + citations to Postgres in the background.

    The response is a streaming text/event-stream where each data event is
    either a token string or a special [DONE] event with citations as JSON.

    Example SSE stream:
        data: The three
        data:  main reasons
        data:  for forgetting are...
        data: [DONE] {"citations": [...], "debug": null}
    """

    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # ------------------------------------------------------------------
    # STEP 1: Get or create a Chat session in Postgres
    # ------------------------------------------------------------------
    if req.chat_id:
        chat = db.query(Chat).filter(
            Chat.id      == req.chat_id,
            Chat.user_id == current_user.id
        ).first()
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found or access denied.")
    else:
        # Auto-create a new chat with the first 50 chars of the query as title
        title = req.query[:50] + ("..." if len(req.query) > 50 else "")
        chat  = Chat(user_id=current_user.id, title=title)
        db.add(chat)
        db.commit()
        db.refresh(chat)

    chat_id = chat.id

    # Fetch recent history to pass to the LLM
    history = get_recent_history(db, chat_id, limit=8)

    # ------------------------------------------------------------------
    # STEP 2: Intent Router — is this a greeting?
    # ------------------------------------------------------------------
    greeting = is_greeting(req.query)

    if greeting:
        # Skip retrieval, just stream a friendly response
        citations  = []
        context    = ""
        debug_info = None

    else:
        # ------------------------------------------------------------------
        # STEP 3: Hybrid Retrieval
        # ------------------------------------------------------------------
        retrieval = hybrid_retriever.retrieve(
            query          = req.query,
            user_id        = current_user.id,
            debug          = req.debug_mode,
        )

        debug_info = retrieval.get("debug")

        # ------------------------------------------------------------------
        # STEP 4: Relevance Threshold Check
        # ------------------------------------------------------------------
        if not retrieval["passed"]:
            # No relevant chunks found — return graceful message without citations
            async def no_context_stream():
                message = "I could not find relevant information in the uploaded documents."
                yield f"data: {message}\n\n"

                done_payload = json.dumps({"citations": [], "debug": debug_info, "chat_id": chat_id})
                yield f"data: [DONE] {done_payload}\n\n"

                # Save to DB
                background_tasks.add_task(
                    save_messages, db, chat_id, req.query, message, []
                )

            return StreamingResponse(no_context_stream(), media_type="text/event-stream")

        # ------------------------------------------------------------------
        # STEP 5: Build context string and citations from top chunks
        # ------------------------------------------------------------------
        top_chunks = retrieval["chunks"]
        context    = "\n\n".join([chunk["content"] for chunk in top_chunks])
        citations  = build_citations(top_chunks)

    # ------------------------------------------------------------------
    # STEP 6: Stream the LLM answer
    # ------------------------------------------------------------------
    async def stream_response():
        full_answer = ""

        try:
            async for token in generate_streaming_answer(
                query       = req.query,
                context     = context,
                chat_history= history,
                is_greeting = greeting,
            ):
                full_answer += token
                # Send each token as an SSE data event
                yield f"data: {token}\n\n"

        except Exception as e:
            error_msg = f"Error generating answer: {str(e)}"
            yield f"data: {error_msg}\n\n"
            full_answer = error_msg

        finally:
            # Send final [DONE] event with citations and optional debug info
            done_payload = json.dumps({
                "citations" : citations,
                "debug"     : debug_info,
                "chat_id"   : chat_id,
            })
            yield f"data: [DONE] {done_payload}\n\n"

            # Save messages to Postgres in the background (non-blocking)
            background_tasks.add_task(
                save_messages, db, chat_id, req.query, full_answer, citations
            )

    return StreamingResponse(stream_response(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "version": "2.20"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
