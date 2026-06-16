import re

# ---------------------------------------------------------------------------
# GREETING KEYWORDS
# If the user's message matches any of these words/phrases, we treat it as a
# casual greeting and skip the document retrieval entirely.
# ---------------------------------------------------------------------------
GREETING_PATTERNS = [
    r"\bhello\b",
    r"\bhi\b",
    r"\bhey\b",
    r"\bhowdy\b",
    r"\bgreetings\b",
    r"\bgood\s*(morning|afternoon|evening|night)\b",
    r"\bhow are you\b",
    r"\bwhat's up\b",
    r"\bwhats up\b",
    r"\bwho are you\b",
    r"\bwhat can you do\b",
    r"\bthanks?\b",
    r"\bthank you\b",
    r"\bbye\b",
    r"\bgoodbye\b",
]

# Compile all patterns into one single regex for fast matching
_GREETING_REGEX = re.compile("|".join(GREETING_PATTERNS), re.IGNORECASE)


def is_greeting(query: str) -> bool:
    """
    Returns True if the query looks like a casual greeting or small talk.
    In that case, we should NOT run the RAG retriever.

    Examples that return True:
        "hi", "Hello there!", "how are you doing?", "thanks!", "bye"

    Examples that return False:
        "what are the main topics of the document?", "summarize chapter 2"
    """
    # Also treat very short queries (1-2 words) that aren't a question as greetings
    words = query.strip().split()
    if len(words) <= 2 and "?" not in query:
        if _GREETING_REGEX.search(query):
            return True

    return bool(_GREETING_REGEX.search(query))
