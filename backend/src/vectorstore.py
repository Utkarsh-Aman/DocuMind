import os
from typing import List, Any
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

class ChromaStore:
    def __init__(self, persist_dir: str = "chroma_db", model_name: str = "all-MiniLM-L6-v2"):
        self.persist_dir = persist_dir
        self.embedding_model = HuggingFaceEmbeddings(model_name=model_name)
        self.vectorstore = Chroma(
            persist_directory=self.persist_dir,
            embedding_function=self.embedding_model,
            collection_name="documind_collection"
        )
        print(f"[INFO] ChromaStore initialized at {self.persist_dir} with model {model_name}")

    def add_documents(self, documents: List[Any]):
        if not documents:
            print("[WARNING] No documents to add.")
            return
        print(f"[INFO] Adding {len(documents)} chunks to Chroma vector store...")
        self.vectorstore.add_documents(documents)
        print(f"[INFO] Successfully added chunks to Chroma.")

    def query(self, query_text: str, top_k: int = 5) -> List[Any]:
        print(f"[INFO] Querying vector store for: '{query_text}'")
        return self.vectorstore.similarity_search(query_text, k=top_k)
