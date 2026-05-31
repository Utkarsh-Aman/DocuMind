'use client';
import { useState, useRef } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string, sources?: any[] }[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadStatus('Uploading and processing...');
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus(`Success! Processed ${data.num_chunks} chunks from ${data.filename}.`);
      } else {
        setUploadStatus(`Error: ${data.detail || 'Upload failed'}`);
      }
    } catch (err) {
      setUploadStatus(`Error: ${err}`);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    const userMessage = query;
    setQuery('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatting(true);
    
    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage })
      });
      const data = await res.json();
      if (res.ok) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.answer, sources: data.sources }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${data.detail}` }]);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${err}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono p-8 selection:bg-green-900">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="border-b border-green-800 pb-4">
          <h1 className="text-3xl font-bold tracking-widest uppercase">
            <span className="text-white">Docu</span>Mind<span className="animate-pulse">_</span>
          </h1>
          <p className="text-green-700 text-sm mt-2">v1.0.0 // SECURE DOCUMENT INTELLIGENCE</p>
        </header>

        <section className="border border-green-800 p-6 rounded-sm bg-black/50 backdrop-blur shadow-[0_0_15px_rgba(0,255,65,0.1)]">
          <h2 className="text-xl mb-4 border-b border-green-900 pb-2 flex items-center gap-2">
            <span className="text-white">{'[1]'}</span> INGEST DOCUMENT
          </h2>
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              onChange={handleFileChange}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-none file:border-0 file:text-sm file:font-mono file:bg-green-900 file:text-green-100 hover:file:bg-green-800 bg-black border border-green-900 p-1 w-full text-green-400 cursor-pointer"
            />
            <button 
              onClick={handleUpload}
              disabled={!file}
              className="bg-green-700 hover:bg-green-500 text-black font-bold py-2 px-6 disabled:opacity-50 disabled:hover:bg-green-700 transition-colors cursor-pointer border border-green-600 shadow-[0_0_10px_rgba(0,255,65,0.3)] hover:shadow-[0_0_20px_rgba(0,255,65,0.6)]"
            >
              EXECUTE
            </button>
          </div>
          {uploadStatus && (
            <div className="mt-4 text-sm bg-green-950/50 border border-green-900 p-3 text-green-300 font-mono flex items-start gap-2">
              <span className="text-green-500 mt-0.5">{'>'}</span> 
              <span>{uploadStatus}</span>
            </div>
          )}
        </section>

        <section className="border border-green-800 p-6 rounded-sm flex flex-col h-[600px] shadow-[0_0_15px_rgba(0,255,65,0.1)]">
          <h2 className="text-xl mb-4 border-b border-green-900 pb-2 flex items-center gap-2">
             <span className="text-white">{'[2]'}</span> QUERY INTERFACE
          </h2>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
            {chatHistory.length === 0 ? (
              <div className="text-green-800/50 text-center h-full flex items-center justify-center italic text-sm">
                SYSTEM STANDBY. AWAITING QUERY INPUT...
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} className={`p-4 ${msg.role === 'user' ? 'bg-green-950/20 border-l-2 border-green-700 ml-8' : 'bg-green-900/10 border-r-2 border-green-500 mr-8'} shadow-sm`}>
                  <div className="text-xs text-green-700 mb-2 font-bold tracking-widest">
                    {msg.role === 'user' ? '>> USER_PROMPT' : '<< SYSTEM_RESPONSE'}
                  </div>
                  <div className="whitespace-pre-wrap text-green-300">{msg.content}</div>
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-green-900/50">
                      <div className="text-xs text-green-600 mb-2">SOURCES REFERENCED:</div>
                      <div className="flex flex-wrap gap-2">
                        {msg.sources.map((src, idx) => (
                          <span key={idx} className="text-[10px] bg-green-950/80 border border-green-800 px-2 py-1 rounded-sm text-green-400">
                            {src.filename} {src.page ? `(p.${src.page})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            {isChatting && (
              <div className="text-green-600 text-sm animate-pulse p-4">Processing query...</div>
            )}
          </div>

          <form onSubmit={handleChat} className="flex gap-3 mt-auto relative">
            <span className="text-green-500 font-bold self-center text-xl absolute left-4 top-3">{'>'}</span>
            <input 
              type="text" 
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter query string..."
              className="flex-1 bg-black border border-green-800 p-4 pl-10 text-green-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all font-mono shadow-[inset_0_0_10px_rgba(0,255,65,0.05)]"
            />
            <button 
              type="submit"
              disabled={!query.trim() || isChatting}
              className="bg-green-800/80 hover:bg-green-600 text-black font-bold px-6 transition-colors border border-green-700"
            >
              SEND
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
