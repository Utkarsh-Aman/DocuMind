---
title: DocuMind Backend
emoji: 🧠
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
base_path: /docs
pinned: false
---

# DocuMind Backend — V2.20

FastAPI RAG Pipeline serving the DocuMind Next.js frontend.

---

## Tech Stack

| Layer       | Technology                              |
|-------------|-----------------------------------------|
| API         | FastAPI + Uvicorn                       |
| Auth        | Google OAuth + JWT (HttpOnly Cookie)    |
| Database    | PostgreSQL (via SQLAlchemy + Alembic)   |
| Vector DB   | ChromaDB (local persistence)            |
| Embeddings  | HuggingFace `all-MiniLM-L6-v2`         |
| LLM         | Groq (`llama-3.3-70b-versatile`)        |
| Retrieval   | Hybrid: ChromaDB Vector + BM25 Keyword  |

---

## Folder Structure

```
backend/
├── main.py                   # All FastAPI routes
├── requirements.txt
├── alembic/                  # DB migration scripts
├── src/
│   ├── data_loader.py        # PDF / DOCX parsing
│   ├── embedding.py          # Text chunking
│   ├── vectorstore.py        # ChromaDB wrapper (returns scores)
│   ├── auth/                 # Google OAuth + JWT + Dependencies
│   ├── database/
│   │   ├── connection.py     # SQLAlchemy engine + session
│   │   └── models.py         # User, Document, Chat, Message tables
│   └── rag/
│       ├── intent_router.py  # Detects greetings → skip RAG
│       ├── retriever.py      # Hybrid Vector + BM25 retrieval
│       └── generator.py      # Streaming LLM answer builder
```

---

## V2.20 Features

### 1. Intent Router
- Greetings like "hi", "how are you" are answered conversationally — no retrieval.

### 2. Relevance Threshold
- If the best similarity score is below `0.20`, the system returns:
  *"I could not find relevant information in the uploaded documents."*
- No hallucinated citations.

### 3. Persistent Chat History
- Chats and messages are stored in PostgreSQL.
- The last 8 messages are sent to the LLM for context.
- Full history is available via `GET /api/chats/{chat_id}/messages`.

### 4. Streaming Responses
- `POST /api/chat` streams answer tokens via Server-Sent Events (SSE).
- Each `data:` event is a token string.
- The final `data: [DONE] {...}` event contains citations and debug info.

### 5. Structured Citations
- Sources returned as JSON: `[{"filename", "page", "score", "preview"}]`
- Duplicate citations (same filename + page) are deduplicated automatically.

### 6. Hybrid Retrieval
- Fetches `15` chunks from ChromaDB (vector similarity).
- Re-ranks with BM25 keyword scoring (in-memory, no extra DB).
- Final score = 50% vector + 50% BM25.
- Returns top `5` best-ranked chunks.

### 7. Developer Debug Mode
- Set `debug_mode: true` in the chat request.
- The `[DONE]` event will include full retrieval scores for all fetched chunks.

---

## API Endpoints

### Auth
| Method | Path                  | Description                        |
|--------|-----------------------|------------------------------------|
| POST   | `/api/auth/google`    | Verify Google token, set JWT cookie|
| POST   | `/api/auth/logout`    | Clear JWT cookie                   |
| GET    | `/api/auth/me`        | Get current user profile           |

### Documents
| Method | Path                          | Description                    |
|--------|-------------------------------|--------------------------------|
| POST   | `/api/upload`                 | Upload & embed a document      |
| GET    | `/api/documents`              | List user's documents          |
| DELETE | `/api/documents/{id}`         | Delete document + its chunks   |

### Chats & Messages
| Method | Path                              | Description                     |
|--------|-----------------------------------|---------------------------------|
| POST   | `/api/chats`                      | Create a new chat session       |
| GET    | `/api/chats`                      | List all chats for the user     |
| GET    | `/api/chats/{chat_id}/messages`   | Load full message history       |
| DELETE | `/api/chats/{chat_id}`            | Delete a chat + all messages    |

### RAG
| Method | Path         | Description                           |
|--------|--------------|---------------------------------------|
| POST   | `/api/chat`  | Ask a question (streaming SSE)        |
| GET    | `/api/health`| Health check                          |

---

## Setup

### 1. Environment Variables
Copy `.env.example` to `.env` and fill in:
```
DATABASE_URL=postgresql://user:password@localhost:5432/documind
GROQ_API_KEY=your_groq_api_key
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET_KEY=your_jwt_secret
GROQ_MODEL=llama-3.3-70b-versatile   # optional, this is the default
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run Database Migrations
```bash
alembic revision --autogenerate -m "add chat and message tables"
alembic upgrade head
```

### 4. Start the Server
```bash
uvicorn main:app --reload --port 8000
```

---

## Consuming the Streaming API (Frontend)

```javascript
const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query: "What is memory?", chat_id: 1 }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
        const payload = line.replace('data: ', '');

        if (payload.startsWith('[DONE]')) {
            const meta = JSON.parse(payload.replace('[DONE] ', ''));
            // meta.citations → list of sources to render
            // meta.chat_id   → use this for subsequent requests
        } else {
            // Append token to displayed answer
            appendToAnswer(payload);
        }
    }
}
```