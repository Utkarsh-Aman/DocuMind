# DocuMind Project Structure and Progress

## Folder and File Structure

### Backend
The backend is a FastAPI application handling the core RAG (Retrieval-Augmented Generation) logic.
- `backend/main.py`: The entry point for the FastAPI server. It exposes endpoints for uploading documents (`/api/upload`) and asking questions (`/api/chat`).
- `backend/requirements.txt`: The python dependencies for the backend (FastAPI, LangChain, ChromaDB, etc.).
- `backend/src/data_loader.py`: Responsible for loading and parsing different types of documents (e.g., PDFs).
- `backend/src/embedding.py`: Handles the chunking of document text and generating embeddings using sentence transformers.
- `backend/src/search.py`: Contains the `RAGSearch` class which interacts with ChromaDB to store documents and retrieve context, and uses Groq/Langchain to generate answers based on the retrieved context.
- `backend/chroma_db/`: Directory where the ChromaDB vector database is persisted.
- `backend/temp_uploads/`: Temporary directory for storing files uploaded via the API before processing.

### Frontend
The frontend is a Next.js application (React framework).
- `frontend/package.json`: Contains project metadata, scripts (`dev`, `build`), and Node.js dependencies (Next.js, React, TailwindCSS).
- `frontend/src/app/page.tsx`: The main React component/page for the application UI. It likely contains the chat interface and file upload component.
- `frontend/src/app/layout.tsx`: The root layout of the Next.js application, defining the global HTML structure and importing global styles.
- `frontend/src/app/globals.css`: Global CSS file, including TailwindCSS directives.

## How to Start the Full Application

### 1. Start the Backend
Open a terminal and navigate to the `backend` directory:
```bash
cd backend
# Create and activate a virtual environment (if not already done)
uv venv
.venv\Scripts\activate # On Windows

# Install dependencies
uv pip install -r requirements.txt

# Start the FastAPI server
uvicorn main:app --reload
```
The backend API will run on `http://localhost:8000`.

### 2. Start the Frontend
Open another terminal and navigate to the `frontend` directory:
```bash
cd frontend
# Install dependencies (if not already done)
npm install

# Start the Next.js development server
npm run dev
```
The frontend application will be available at `http://localhost:3000`.
