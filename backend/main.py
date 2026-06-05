import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from src.data_loader import load_document
from src.embedding import EmbeddingPipeline
from src.search import RAGSearch

app = FastAPI(title="DocuMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://documind-lyart.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize global RAG components
rag_search = RAGSearch(persist_dir="chroma_db")
embedding_pipe = EmbeddingPipeline(chunk_size=1000, chunk_overlap=200)

class ChatRequest(BaseModel):
    query: str

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
        
    temp_path = os.path.join(TEMP_DIR, file.filename)
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"[INFO] Uploaded file saved to {temp_path}")
        
        # Load and parse document
        docs = load_document(temp_path)
        if not docs:
            raise HTTPException(status_code=500, detail="Failed to parse document.")
            
        # Chunk document
        chunks = embedding_pipe.chunk_documents(docs)
        if not chunks:
            raise HTTPException(status_code=500, detail="Document produced no text chunks.")
            
        # Store in ChromaDB
        rag_search.vectorstore.add_documents(chunks)
        
        return {
            "status": "success",
            "filename": file.filename,
            "num_chunks": len(chunks)
        }
    except Exception as e:
        print(f"[ERROR] Exception during upload processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/chat")
async def chat_query(req: ChatRequest):
    if not req.query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    try:
        result = rag_search.search_and_summarize(req.query, top_k=5)
        return result
    except Exception as e:
        print(f"[ERROR] Exception during chat query: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
