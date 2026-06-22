import re
from typing import Optional
import json

# ---------------------------------------------------------------------------
# KEYWORDS FOR FAST ROUTING
# ---------------------------------------------------------------------------
GREETING_PATTERNS = [
    r"\bhello\b", r"\bhi\b", r"\bhey\b", r"\bhowdy\b", r"\bgreetings\b",
    r"\bgood\s*(morning|afternoon|evening|night)\b", r"\bhow are you\b",
    r"\bwhat's up\b", r"\bwhats up\b", r"\bwho are you\b",
    r"\bthanks?\b", r"\bthank you\b", r"\bbye\b", r"\bgoodbye\b"
]

SUMMARY_PATTERNS = [
    r"\bsummarize\b", r"\bsummary\b", r"\bwhat is this( document| pdf)? about\b",
    r"\btl;?dr\b", r"\bgive me the key takeaways\b", r"\bmain topics\b",
    r"\boverview\b", r"\bbrief me\b"
]

_GREETING_REGEX = re.compile("|".join(GREETING_PATTERNS), re.IGNORECASE)
_SUMMARY_REGEX = re.compile("|".join(SUMMARY_PATTERNS), re.IGNORECASE)


def route_intent(query: str, llm_fallback_fn=None) -> str:
    """
    Classifies the user query into one of:
    - GREETING
    - SMALL_TALK
    - DOC_SUMMARY
    - DOC_OVERVIEW
    - DOC_QUERY

    Uses regex first for speed. If ambiguous and an LLM function is provided, falls back to LLM.
    """
    q_lower = query.strip().lower()
    
    # 1. Fast Regex Checks
    if _SUMMARY_REGEX.search(q_lower):
        # We group summary and overview into DOC_SUMMARY/DOC_OVERVIEW
        if "overview" in q_lower or "main topic" in q_lower:
            return "DOC_OVERVIEW"
        return "DOC_SUMMARY"
        
    words = q_lower.split()
    if len(words) <= 3 and "?" not in q_lower:
        if _GREETING_REGEX.search(q_lower):
            return "GREETING"

    if _GREETING_REGEX.search(q_lower) and len(words) < 5:
        return "GREETING"

    # 2. LLM Fallback (if provided)
    if llm_fallback_fn:
        try:
            llm_intent = llm_fallback_fn(query)
            if llm_intent in ["GREETING", "SMALL_TALK", "DOC_SUMMARY", "DOC_OVERVIEW", "DOC_QUERY"]:
                return llm_intent
        except Exception as e:
            print(f"[WARNING] LLM intent routing failed: {e}")

    # 3. Default Fallback
    return "DOC_QUERY"
