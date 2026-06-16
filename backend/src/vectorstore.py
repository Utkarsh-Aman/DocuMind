import os
from typing import List, Any, Tuple
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings


class ChromaStore:
    def __init__(self, persist_dir: str = "chroma_db", model_name: str = "all-MiniLM-L6-v2"):
        self.persist_dir     = persist_dir
        self.embedding_model = HuggingFaceEmbeddings(model_name=model_name)
        self.vectorstore     = Chroma(
            persist_directory=self.persist_dir,
            embedding_function=self.embedding_model,
            collection_name="documind_collection"
        )
        print(f"[INFO] ChromaStore initialized at {self.persist_dir} with model {model_name}")

    def add_documents(self, documents: List[Any]):
        """Embed and store a list of document chunks."""
        if not documents:
            print("[WARNING] No documents to add.")
            return
        print(f"[INFO] Adding {len(documents)} chunks to Chroma vector store...")
        self.vectorstore.add_documents(documents)
        print(f"[INFO] Successfully added chunks to Chroma.")

    def query_with_scores(self, query_text: str, user_id: int, top_k: int = 10) -> List[Tuple[Any, float]]:
        """
        Query ChromaDB and return a list of (document, score) tuples.

        Score is the cosine SIMILARITY (higher = more relevant).
        Chroma by default returns 'distance' (lower = more relevant), so we
        convert it: similarity = 1 - distance.

        We fetch more results than needed (top_k=10 by default) so that the
        BM25 re-ranker in retriever.py has a decent pool to work with.
        """
        print(f"[INFO] Querying vector store for user_id={user_id}: '{query_text}'")

        # similarity_search_with_relevance_scores returns (Document, similarity_score)
        results = self.vectorstore.similarity_search_with_relevance_scores(
            query_text,
            k=top_k,
            filter={"user_id": str(user_id)}
        )
        return results  # each item is (Document, float)

    def delete_document_chunks(self, user_id: int, document_id: int):
        """
        Delete all chunks in Chroma that belong to a specific document
        owned by a specific user.
        """
        print(f"[INFO] Deleting chunks from Chroma for user_id={user_id}, document_id={document_id}")
        self.vectorstore._collection.delete(
            where={
                "$and": [
                    {"user_id": str(user_id)},
                    {"document_id": str(document_id)}
                ]
            }
        )
        print(f"[INFO] Successfully deleted Chroma chunks.")
