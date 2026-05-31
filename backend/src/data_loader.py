import os
from pathlib import Path
from typing import List, Any
from langchain_community.document_loaders import PyPDFLoader, TextLoader, CSVLoader, JSONLoader
from langchain_community.document_loaders import Docx2txtLoader
from langchain_community.document_loaders.excel import UnstructuredExcelLoader
from langchain_core.documents import Document

def load_document(file_path: str) -> List[Any]:
    path = Path(file_path)
    ext = path.suffix.lower()
    
    print(f"[DEBUG] Loading file: {file_path} with extension {ext}")
    
    try:
        if ext == '.pdf':
            return PyPDFLoader(file_path).load()
        elif ext == '.txt':
            return TextLoader(file_path).load()
        elif ext == '.csv':
            return CSVLoader(file_path).load()
        elif ext == '.xlsx':
            return UnstructuredExcelLoader(file_path).load()
        elif ext == '.docx':
            return Docx2txtLoader(file_path).load()
        elif ext == '.json':
            try:
                return JSONLoader(file_path, jq_schema=".").load()
            except Exception:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return [Document(page_content=content, metadata={"source": file_path})]
        else:
            print(f"[WARNING] Unsupported file type: {ext}. Reading as raw text.")
            return TextLoader(file_path).load()
    except Exception as e:
        print(f"[ERROR] Failed to load {file_path}: {e}")
        return []
