import os
from dotenv import load_dotenv
from src.vectorstore import ChromaStore
from langchain_groq import ChatGroq

load_dotenv()

class RAGSearch:
    def __init__(self, persist_dir: str = "chroma_db", embedding_model: str = "all-MiniLM-L6-v2", llm_model: str = "openai/gpt-oss-120b"):
        self.vectorstore = ChromaStore(persist_dir, embedding_model)
        
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            print("[WARNING] GROQ_API_KEY not found in environment!")
            
        self.llm = ChatGroq(groq_api_key=groq_api_key, model_name=llm_model)
        print(f"[INFO] Groq LLM initialized: {llm_model}")

    def search_and_summarize(self, query: str, user_id: int, top_k: int = 5):
        results = self.vectorstore.query(query, user_id=user_id, top_k=top_k)
        
        texts = [r.page_content for r in results]
        context = "\n\n".join(texts)
        
        sources = []
        for r in results:
            src = r.metadata.get("source", "Unknown Source")
            filename = os.path.basename(src)
            page = r.metadata.get("page", 0) + 1 if "page" in r.metadata else None
            sources.append({
                "filename": filename,
                "page": page,
                "content": r.page_content
            })
            
        if not context:
            return {"answer": "No relevant context found in documents.", "sources": []}
            
        prompt = f"Answer the following query based on the context provided: '{query}'. Provide a clear, concise, and helpful answer. Do not say 'Based on the context'. also if the answer is not in the context then say No relevant context found in documents. and do not make it up.\n\nContext:\n{context}\n\nAnswer:"
        
        try:
            response = self.llm.invoke([prompt])
            answer = response.content
        except Exception as e:
            answer = f"Error calling LLM: {str(e)}"
            
        return {"answer": answer, "sources": sources}
