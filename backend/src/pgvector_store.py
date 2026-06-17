from typing import List, Tuple, Any
from sqlalchemy.orm import Session
from src.database.models import DocumentChunk
from langchain_community.embeddings import HuggingFaceEmbeddings

class PGVectorStore:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.embedding_model = HuggingFaceEmbeddings(model_name=model_name)
        print(f"[INFO] PGVectorStore initialized with model {model_name}")

    def add_documents(self, db: Session, documents: List[Any], user_id: int, document_id: int):
        """Embed and store a list of document chunks in PostgreSQL."""
        if not documents:
            print("[WARNING] No documents to add.")
            return
            
        print(f"[INFO] Adding {len(documents)} chunks to pgvector store...")
        texts = [doc.page_content for doc in documents]
        embeddings = self.embedding_model.embed_documents(texts)
        
        for doc, embedding in zip(documents, embeddings):
            chunk = DocumentChunk(
                document_id=document_id,
                user_id=user_id,
                page_content=doc.page_content,
                metadata_json=doc.metadata,
                embedding=embedding
            )
            db.add(chunk)
            
        db.commit()
        print(f"[INFO] Successfully added chunks to pgvector.")

    def query_with_scores(self, db: Session, query_text: str, user_id: int, top_k: int = 10) -> List[Tuple[Any, float]]:
        """
        Query pgvector and return a list of (Document, score) tuples.
        Score is cosine SIMILARITY (higher = more relevant).
        """
        print(f"[INFO] Querying pgvector store for user_id={user_id}: '{query_text}'")
        query_embedding = self.embedding_model.embed_query(query_text)
        
        # pgvector cosine_distance returns distance (0 is exact match, 2 is opposite).
        # We convert to similarity: 1 - distance
        results = (
            db.query(DocumentChunk, DocumentChunk.embedding.cosine_distance(query_embedding).label("distance"))
            .filter(DocumentChunk.user_id == user_id)
            .order_by("distance")
            .limit(top_k)
            .all()
        )
        
        # We need to return an object with page_content and metadata for the retriever
        class DummyDoc:
            def __init__(self, page_content, metadata):
                self.page_content = page_content
                self.metadata = metadata

        output = []
        for chunk, distance in results:
            similarity = 1.0 - distance
            doc = DummyDoc(page_content=chunk.page_content, metadata=chunk.metadata_json)
            output.append((doc, similarity))
            
        return output

    def delete_document_chunks(self, db: Session, user_id: int, document_id: int):
        """
        Delete all chunks in pgvector that belong to a specific document.
        (Actually cascading delete on Document model already handles this, 
        but provided for compatibility)
        """
        db.query(DocumentChunk).filter(
            DocumentChunk.user_id == user_id, 
            DocumentChunk.document_id == document_id
        ).delete()
        db.commit()
        print(f"[INFO] Successfully deleted pgvector chunks.")
