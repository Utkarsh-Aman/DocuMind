# DocuMind - Secure AI Document RAG Platform

DocuMind is an enterprise-grade, multi-user Retrieval-Augmented Generation (RAG) platform. It secures user documents through complete Google OAuth authentication, local/cloud PostgreSQL storage, and isolated ChromaDB vector indexing (metadata filtering).

---

## Key Features

1. **Google OAuth 2.0 Integration**: Authenticate securely using Google Login, automatically provisioning user accounts.
2. **Session Security (HttpOnly Cookies)**: Tokens are signed on the backend (JWT) and stored securely in HttpOnly, SameSite cookies to mitigate XSS risks.
3. **Strict Document Isolation**: ChromaDB collections utilize metadata filters matching the authenticated database `user_id`. Users can never query, list, or delete another user's documents.
4. **Relational Data Mapping**: SQLAlchemy models track Users and Documents in PostgreSQL (Neon serverless setup).
5. **Real-time Status Polling**: The frontend vault tracks document parsing and embedding status dynamically.
6. **Animated Dark UI**: Designed with TailwindCSS v4 and Framer Motion for a modern, glassmorphic dark-theme console experience.

---

## Folder Structure

```text
DocuMind/
├── backend/
│   ├── alembic/                # Database migrations
│   ├── chroma_db/              # Persistent Chroma database storage
│   ├── src/
│   │   ├── auth/               # Auth package (Google verify, JWT, dependencies)
│   │   ├── database/           # DB package (SQLAlchemy connections and models)
│   │   ├── data_loader.py      # Document parser (PDF, TXT, CSV, DOCX, JSON, Excel)
│   │   ├── embedding.py        # Text splitter & Embedding pipe
│   │   ├── search.py           # RAG retrieval & Groq LLM logic
│   │   └── vectorstore.py      # Chroma Store client with user isolation
│   ├── Dockerfile
│   ├── main.py                 # FastAPI application router
│   └── requirements.txt        # Backend python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/      # Protected dashboard workspaces
│   │   │   ├── login/          # Google sign-in landing card
│   │   │   ├── globals.css     # Styling sheets with TailwindCSS import
│   │   │   ├── layout.tsx      # Root html layout shell
│   │   │   └── page.tsx        # Auto-routing landing page
│   │   └── middleware.ts       # Server-side auth route guard middleware
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml          # FastAPI + local PostgreSQL config
└── README.md
```

---

## Setup & Configuration

### Prerequisites
- Node.js
- Python (3.10+)
- Google Cloud Console client credentials (configured origin )
- Groq API Key (for LLM RAG inference)

### 1. Environment Variables

Create `.env` in the `backend/` directory:
```env
GROQ_API_KEY="your-groq-api-key"
DATABASE_URL="postgresql://neondb_owner:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.tech/neondb?sslmode=require"
GOOGLE_CLIENT_ID="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
JWT_SECRET="rag-for-docs-super-secret-key-change-this-in-production"
```

Create `.env` in the `frontend/` directory:
```env
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"
```

---

## How to Run

### Development Mode

#### Step A: Run the Backend
1. Open terminal in `backend/` folder:
   ```bash
   cd backend
   # Ensure virtual environment is ready
   uv venv
   # Activate it (Windows)
   .venv\Scripts\activate
   # Install dependencies
   uv pip install -r requirements.txt
   ```
2. Apply database schemas to PostgreSQL:
   ```bash
   python -m alembic upgrade head
   ```
3. Run the FastAPI development server:
   ```bash
   uvicorn main:app --reload
   ```
   The backend API will run on `http://localhost:8000`.

#### Step B: Run the Frontend
1. Open another terminal in the `frontend/` folder:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The client application will run on `http://localhost:3000`.

---

### Production Deployment via Docker Compose

To deploy the stack locally with a local PostgreSQL server, run the following from the root workspace directory:
```bash
docker-compose up --build
```
This launches a PostgreSQL container mapped to port `5432` and builds/starts the FastAPI backend container listening on port `8000`.
