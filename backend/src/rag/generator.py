import os
from typing import List, Dict, Any, AsyncGenerator
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# LLM SETUP
# ---------------------------------------------------------------------------

# Default Groq model — llama-3.3-70b-versatile is fast, free, and supports streaming.
# Switch to "llama3-8b-8192" if you want something even lighter/faster.
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def build_llm(streaming: bool = False) -> ChatGroq:
    """Create and return a ChatGroq LLM instance."""
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not set in environment variables.")

    return ChatGroq(
        groq_api_key=groq_api_key,
        model_name=DEFAULT_MODEL,
        streaming=streaming,
        temperature=0.3,        # Slightly creative but mostly factual
        max_tokens=1024,        # Keep answers concise
    )


# ---------------------------------------------------------------------------
# PROMPT BUILDERS
# ---------------------------------------------------------------------------

def build_rag_prompt(
    query: str,
    context: str,
    chat_history: List[Dict[str, str]]
) -> List:
    """
    Build a list of LangChain messages to send to the LLM.

    Structure:
        [SystemMessage]             ← instructions for the assistant
        [HumanMessage / AIMessage]  ← last 4-8 messages from history
        [HumanMessage]              ← current user question with context
    """

    system_prompt = (
        "You are DocuMind, an intelligent document assistant. "
        "Answer the user's question using ONLY the context provided below. "
        "Format your response using clean Markdown: "
        "use numbered lists (1. 2. 3.) with a blank line between items, "
        "use **bold** for key terms, and use headings (## or ###) for multi-section answers. "
        "Keep answers concise and well-structured. "
        "Do NOT write numbered items all on one line — each item must be on its own line. "
        "Do NOT make up information that is not in the context. "
        "If the context does not contain the answer, say so honestly."
    )

    messages = [SystemMessage(content=system_prompt)]

    # Add recent chat history (last few turns for context window)
    for turn in chat_history:
        if turn["role"] == "user":
            messages.append(HumanMessage(content=turn["content"]))
        else:
            messages.append(AIMessage(content=turn["content"]))

    # Add the current question with the retrieved context
    user_message = (
        f"Context from documents:\n{context}\n\n"
        f"Question: {query}"
    )
    messages.append(HumanMessage(content=user_message))

    return messages


def build_greeting_prompt(query: str) -> List:
    """
    Simple prompt for greetings — no document context needed.
    """
    system_prompt = (
        "You are DocuMind, a friendly document assistant. "
        "Respond warmly to the user's greeting. "
        "Let them know you are ready to help them understand their uploaded documents."
    )
    return [
        SystemMessage(content=system_prompt),
        HumanMessage(content=query),
    ]


# ---------------------------------------------------------------------------
# ANSWER GENERATORS
# ---------------------------------------------------------------------------

async def generate_streaming_answer(
    query: str,
    context: str,
    chat_history: List[Dict[str, str]],
    is_greeting: bool = False
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams the LLM response token by token.

    Usage (in FastAPI):
        async for token in generate_streaming_answer(...):
            yield token

    Each yielded value is a small string (a token or short phrase).
    """
    llm = build_llm(streaming=True)

    if is_greeting:
        messages = build_greeting_prompt(query)
    else:
        messages = build_rag_prompt(query, context, chat_history)

    # Stream tokens from Groq
    async for chunk in llm.astream(messages):
        token = chunk.content
        if token:
            yield token


def generate_answer(
    query: str,
    context: str,
    chat_history: List[Dict[str, str]],
    is_greeting: bool = False
) -> str:
    """
    Non-streaming version — returns the full answer as a single string.
    Useful for saving the final answer to the database after streaming.
    """
    llm = build_llm(streaming=False)

    if is_greeting:
        messages = build_greeting_prompt(query)
    else:
        messages = build_rag_prompt(query, context, chat_history)

    response = llm.invoke(messages)
    return response.content


# ---------------------------------------------------------------------------
# CITATION BUILDER
# ---------------------------------------------------------------------------

def build_citations(chunks: List[Dict]) -> List[Dict[str, Any]]:
    """
    Convert raw retrieval chunks into clean citation objects for the frontend.

    Deduplicates by (filename, page) so the same page is not listed twice.

    Returns a list like:
        [
            {"filename": "lecture.pdf", "page": 3, "score": 0.87, "preview": "..."},
            ...
        ]
    """
    seen     = set()
    citations = []

    for chunk in chunks:
        meta     = chunk["metadata"]
        filename = meta.get("filename", meta.get("source", "Unknown"))
        page     = meta.get("page", None)

        # If page is 0-indexed (PyMuPDF), convert to 1-indexed for display
        if isinstance(page, int):
            page = page + 1

        dedup_key = (filename, page)
        if dedup_key not in seen:
            seen.add(dedup_key)
            citations.append({
                "filename" : filename,
                "page"     : page,
                "score"    : chunk.get("final_score", chunk.get("vector_score", 0.0)),
                "preview"  : chunk["content"][:200] + "..."
            })

    return citations
