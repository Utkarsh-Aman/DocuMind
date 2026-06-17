from typing import List, Dict, Any
from rank_bm25 import BM25Okapi
from src.pgvector_store import PGVectorStore
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# CONSTANTS — tweak these to control retrieval behavior
# ---------------------------------------------------------------------------

# Minimum similarity score a chunk must have to be used in an answer.
# Chunks below this are considered "not relevant enough."
RELEVANCE_THRESHOLD = 0.20

# How many chunks to initially fetch from ChromaDB before BM25 re-ranking.
INITIAL_FETCH_K = 15

# How many final chunks to keep after re-ranking (sent to LLM as context).
FINAL_TOP_K = 5


class HybridRetriever:
    """
    Retrieves the most relevant document chunks for a query using two steps:

    Step 1 — Vector Search (pgvector):
        Fetch the top INITIAL_FETCH_K chunks using semantic similarity.
        Each chunk gets a cosine similarity score (0.0 – 1.0).

    Step 2 — BM25 Keyword Re-rank (in memory):
        Run BM25 over the fetched pool to get keyword relevance scores.
        Combine both scores (50% vector + 50% BM25) and pick the best FINAL_TOP_K.
    """

    def __init__(self, vectorstore: PGVectorStore):
        self.vectorstore = vectorstore

    def retrieve(
        self,
        db: Session,
        query: str,
        user_id: int,
        top_k: int = FINAL_TOP_K,
        score_threshold: float = RELEVANCE_THRESHOLD,
        debug: bool = False
    ) -> Dict[str, Any]:
        """
        Run the full hybrid retrieval pipeline.
        """

        # ------------------------------------------------------------------
        # STEP 1: Vector search — get a large pool from pgvector with scores
        # ------------------------------------------------------------------
        raw_results = self.vectorstore.query_with_scores(
            db=db,
            query_text=query,
            user_id=user_id,
            top_k=INITIAL_FETCH_K
        )

        if not raw_results:
            return {"chunks": [], "passed": False, "debug": None}

        # Unpack (Document, score) tuples
        docs   = [doc for doc, _score in raw_results]
        scores = [score for _doc, score in raw_results]

        # Check if the BEST vector score is above our threshold
        best_vector_score = max(scores)
        if best_vector_score < score_threshold:
            return {"chunks": [], "passed": False, "debug": None}

        # ------------------------------------------------------------------
        # STEP 2: BM25 keyword scoring over the fetched pool
        # ------------------------------------------------------------------

        # Tokenize each chunk's text into words for BM25
        tokenized_chunks = [doc.page_content.lower().split() for doc in docs]
        bm25             = BM25Okapi(tokenized_chunks)

        # Get BM25 scores for the query
        query_tokens  = query.lower().split()
        bm25_scores   = bm25.get_scores(query_tokens)

        # Normalize BM25 scores to 0.0–1.0 range so they are comparable to vector scores
        bm25_max = max(bm25_scores) if max(bm25_scores) > 0 else 1.0
        bm25_scores_normalized = [s / bm25_max for s in bm25_scores]

        # ------------------------------------------------------------------
        # STEP 3: Combine scores (50% vector, 50% BM25) and sort
        # ------------------------------------------------------------------
        combined = []
        for i, doc in enumerate(docs):
            vector_score = scores[i]
            bm25_score   = bm25_scores_normalized[i]
            final_score  = (0.5 * vector_score) + (0.5 * bm25_score)

            combined.append({
                "content"      : doc.page_content,
                "metadata"     : doc.metadata,
                "vector_score" : round(vector_score, 4),
                "bm25_score"   : round(bm25_score, 4),
                "final_score"  : round(final_score, 4),
            })

        # Sort by final score descending and pick the top_k best
        combined.sort(key=lambda x: x["final_score"], reverse=True)
        top_chunks = combined[:top_k]

        # ------------------------------------------------------------------
        # Build debug info (only included when debug=True)
        # ------------------------------------------------------------------
        debug_info = None
        if debug:
            debug_info = {
                "query"            : query,
                "total_fetched"    : len(docs),
                "best_vector_score": best_vector_score,
                "threshold"        : score_threshold,
                "chunks_detail"    : [
                    {
                        "preview"      : c["content"][:100] + "...",
                        "vector_score" : c["vector_score"],
                        "bm25_score"   : c["bm25_score"],
                        "final_score"  : c["final_score"],
                        "source"       : c["metadata"].get("filename", "unknown"),
                        "page"         : c["metadata"].get("page", "unknown"),
                    }
                    for c in combined  # show all, not just top_k
                ]
            }

        return {
            "chunks" : top_chunks,
            "passed" : True,
            "debug"  : debug_info
        }
