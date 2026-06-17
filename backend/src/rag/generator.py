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
        "CRITICAL FORMATTING RULES:\n"
        "1. You MUST use clean Markdown.\n"
        "2. For lists (numbered or bulleted), you MUST leave a blank line (double newline) before the list, after the list, and between each list item.\n"
        "3. Only use **bold** for specific key terms. Ensure all **bold** tags are properly closed so the whole text doesn't become bold.\n"
        "4. Use headings (## or ###) to separate sections, followed by a blank line.\n"
        "5. Never put multiple numbered items on the same line.\n"
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
# SUMMARIZATION
# ---------------------------------------------------------------------------

async def generate_document_summary(chunks: List[str]) -> Dict[str, Any]:
    """
    Recursively summarizes a large document.
    chunks: list of text chunks
    Returns a dict with {"summary": str, "key_topics": list}
    """
    llm = build_llm(streaming=False)
    
    # Recursive summarization if too many chunks
    current_chunks = chunks
    while len(current_chunks) > 10:
        next_chunks = []
        # Group by 10
        for i in range(0, len(current_chunks), 10):
            group = current_chunks[i:i+10]
            context = "\n\n".join(group)
            prompt = [
                SystemMessage(content="Summarize the following text briefly. Provide a single paragraph summary."),
                HumanMessage(content=context)
            ]
            response = await llm.ainvoke(prompt)
            next_chunks.append(response.content)
        current_chunks = next_chunks

    # Final summary and topics extraction
    final_context = "\n\n".join(current_chunks)
    system_prompt = (
        "You are an expert summarizer. Analyze the following text and provide a JSON response with two keys:\n"
        "1. 'summary': A comprehensive but concise overview of the entire document.\n"
        "2. 'key_topics': A list of 3-5 main topics covered.\n\n"
        "Respond ONLY with valid JSON."
    )
    prompt = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=final_context)
    ]
    
    response = await llm.ainvoke(prompt)
    try:
        import json
        content = response.content
        # Try to parse JSON from the response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].strip()
        parsed = json.loads(content)
        return {"summary": parsed.get("summary", ""), "key_topics": parsed.get("key_topics", [])}
    except Exception as e:
        print(f"[WARNING] Failed to parse summary JSON: {e}")
        return {"summary": response.content, "key_topics": []}

# ---------------------------------------------------------------------------
# INTENT FALLBACK
# ---------------------------------------------------------------------------

def llm_intent_fallback(query: str) -> str:
    """Fallback to LLM for intent routing."""
    llm = build_llm(streaming=False)
    system_prompt = (
        "Classify the user's query into exactly one of the following categories:\n"
        "GREETING, SMALL_TALK, DOC_SUMMARY, DOC_OVERVIEW, DOC_QUERY\n\n"
        "Reply with ONLY the category name. No other text."
    )
    prompt = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=query)
    ]
    response = llm.invoke(prompt)
    return response.content.strip().upper()


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
