'use client';
import { useState, useRef, useEffect } from 'react';
import React from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string, sources?: any[] }[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const handleFileChangeAndUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setUploadStatus('Uploading and processing...');
      setIsFileUploaded(false);
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          setUploadStatus(`Success! Processed ${data.num_chunks} chunks from ${data.filename}.`);
          setIsFileUploaded(true);
        } else {
          setUploadStatus(`Error: ${data.detail || 'Upload failed'}`);
          setIsFileUploaded(false);
        }
      } catch (err) {
        setUploadStatus(`Error: ${err}`);
        setIsFileUploaded(false);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !isFileUploaded) return;
    
    const userMessage = query;
    setQuery('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatting(true);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/chat`, {
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

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, isChatting]);

  // Helper for parsing bold and inline code
  const parseInlineStyles = (text: string) => {
    const tokens: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;
    
    while (remaining) {
      const boldMatch = remaining.match(/^([\s\S]*?)\*\*(.*?)\*\*([\s\S]*)$/);
      const codeMatch = remaining.match(/^([\s\S]*?)`(.*?)`([\s\S]*)$/);
      
      const boldIdx = boldMatch ? boldMatch[1].length : -1;
      const codeIdx = codeMatch ? codeMatch[1].length : -1;
      
      if (boldMatch && (codeIdx === -1 || boldIdx < codeIdx)) {
        if (boldMatch[1]) {
          tokens.push(<span key={keyIdx++}>{boldMatch[1]}</span>);
        }
        tokens.push(<strong key={keyIdx++} className="font-bold text-white">{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
      } else if (codeMatch) {
        if (codeMatch[1]) {
          tokens.push(<span key={keyIdx++}>{codeMatch[1]}</span>);
        }
        tokens.push(
          <code key={keyIdx++} className="bg-green-950/60 border border-green-800/40 px-1 py-0.5 rounded font-mono text-green-200 text-xs">
            {codeMatch[2]}
          </code>
        );
        remaining = codeMatch[3];
      } else {
        tokens.push(<span key={keyIdx++}>{remaining}</span>);
        break;
      }
    }
    
    return tokens.length > 0 ? tokens : text;
  };

  // Custom Markdown parsing helper
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        let language = '';
        let code = part.slice(3, -3).trim();
        
        if (lines.length > 0 && /^[a-zA-Z0-9_-]+$/.test(lines[0])) {
          language = lines[0];
          code = lines.slice(1).join('\n');
        }
        
        return (
          <pre key={index} className="bg-green-950/20 border border-green-800/50 p-3 my-3 rounded font-mono text-xs overflow-x-auto text-green-300">
            {language && <div className="text-[10px] text-green-600 mb-1 uppercase tracking-widest">{language}</div>}
            <code>{code}</code>
          </pre>
        );
      } else {
        const lines = part.split('\n');
        const elements: React.ReactNode[] = [];
        let currentList: React.ReactNode[] = [];
        let listType: 'ul' | 'ol' | null = null;
        
        const flushList = (key: string) => {
          if (currentList.length > 0) {
            if (listType === 'ul') {
              elements.push(<ul key={`ul-${key}`} className="list-disc pl-6 my-2 space-y-1">{...currentList}</ul>);
            } else if (listType === 'ol') {
              elements.push(<ol key={`ol-${key}`} className="list-decimal pl-6 my-2 space-y-1">{...currentList}</ol>);
            }
            currentList = [];
            listType = null;
          }
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
          if (headerMatch) {
            flushList(`hdr-${i}`);
            const level = headerMatch[1].length;
            const text = parseInlineStyles(headerMatch[2]);
            const classes = level === 1 ? 'text-xl font-bold my-3 text-white border-b border-green-955 pb-1' :
                            level === 2 ? 'text-lg font-bold my-2 text-white' :
                            'text-md font-bold my-1 text-green-200';
            elements.push(
              React.createElement(`h${level}`, { key: `h-${i}`, className: classes }, text)
            );
            continue;
          }
          
          const ulMatch = line.match(/^[-*+]\s+(.*)$/);
          if (ulMatch) {
            if (listType !== 'ul') {
              flushList(`ul-prev-${i}`);
              listType = 'ul';
            }
            currentList.push(<li key={`li-${i}`} className="text-green-300">{parseInlineStyles(ulMatch[1])}</li>);
            continue;
          }
          
          const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
          if (olMatch) {
            if (listType !== 'ol') {
              flushList(`ol-prev-${i}`);
              listType = 'ol';
            }
            currentList.push(<li key={`li-${i}`} className="text-green-300">{parseInlineStyles(olMatch[2])}</li>);
            continue;
          }
          
          if (line.trim() === '') {
            flushList(`blank-${i}`);
            elements.push(<div key={`blank-div-${i}`} className="h-2" />);
            continue;
          }
          
          flushList(`std-${i}`);
          elements.push(
            <p key={`p-${i}`} className="my-1.5 leading-relaxed text-green-300">
              {parseInlineStyles(line)}
            </p>
          );
        }
        
        flushList(`end-${index}`);
        return <div key={index}>{elements}</div>;
      }
    });
  };

  return (
    <div className="h-screen w-screen bg-black text-green-500 font-mono p-6 flex flex-col overflow-hidden selection:bg-green-900">
      <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col min-h-0 space-y-4">
        <header className="border-b border-green-800 pb-3 flex-shrink-0 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-widest uppercase">
              <span className="text-white">Docu</span>Mind<span className="animate-pulse">_</span>
            </h1>
            <p className="text-green-700 text-xs mt-1">v1.0.0 // SECURE DOCUMENT INTELLIGENCE</p>
          </div>
          {file && isFileUploaded && (
            <div className="text-[10px] text-green-400 bg-green-950/40 border border-green-900 px-2.5 py-1 rounded-sm uppercase tracking-wider">
              Active: {file.name}
            </div>
          )}
        </header>

        <section className="border border-green-800 rounded-sm flex-1 flex flex-col min-h-0 bg-black/50 backdrop-blur shadow-[0_0_15px_rgba(0,255,65,0.05)]">
          <h2 className="text-sm px-4 py-3 border-b border-green-900 flex items-center gap-2 flex-shrink-0">
            <span className="text-white">{'[SYS]'}</span> INTERFACE CONSOLE
          </h2>
          
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 custom-scrollbar">
            {chatHistory.length === 0 ? (
              <div className="text-green-800/60 text-center h-full flex flex-col items-center justify-center italic text-sm space-y-2">
                <div>SYSTEM STANDBY. AWAITING DOCUMENT INGESTION...</div>
                <div className="text-xs text-green-900 not-italic">Click the plus icon (+) to upload and process your file.</div>
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} className={`p-4 ${msg.role === 'user' ? 'bg-green-950/20 border-l-2 border-green-700 ml-8' : 'bg-green-900/10 border-r-2 border-green-500 mr-8'} shadow-sm`}>
                  <div className="text-xs text-green-700 mb-2 font-bold tracking-widest">
                    {msg.role === 'user' ? '>> USER_PROMPT' : '<< SYSTEM_RESPONSE'}
                  </div>
                  <div className="text-green-300 font-sans text-sm leading-relaxed">{renderMessageContent(msg.content)}</div>
                  
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

          <div className="border-t border-green-900 p-4 bg-black/40 flex-shrink-0">
            {uploadStatus && (
              <div className={`mb-3 text-xs border p-2.5 font-mono flex items-start gap-2 ${
                uploadStatus.startsWith('Error') 
                  ? 'bg-red-950/20 border-red-900 text-red-400' 
                  : uploadStatus.startsWith('Success')
                  ? 'bg-green-950/40 border-green-900 text-green-300'
                  : 'bg-green-950/20 border-green-900 text-green-500 animate-pulse'
              }`}>
                <span className="mt-0.5">{uploadStatus.startsWith('Error') ? '!' : uploadStatus.startsWith('Success') ? '✓' : '>'}</span>
                <span>{uploadStatus}</span>
              </div>
            )}

            <form onSubmit={handleChat} className="flex gap-2 relative items-center">
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChangeAndUpload}
                className="hidden"
                accept=".pdf,.txt,.csv,.xlsx,.docx,.json"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload document"
                className="h-12 w-12 flex items-center justify-center bg-green-900/20 hover:bg-green-900/50 text-green-400 hover:text-white border border-green-800 hover:border-green-600 transition-all cursor-pointer text-xl font-bold flex-shrink-0 shadow-[0_0_10px_rgba(0,255,65,0.05)]"
              >
                +
              </button>
              <div className="flex-1 relative flex items-center">
                <span className="text-green-500 font-bold self-center text-lg absolute left-4">{'>'}</span>
                <input 
                  type="text" 
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  disabled={!isFileUploaded || isChatting}
                  placeholder={isFileUploaded ? "Enter query string..." : "Please upload a document to start querying..."}
                  className="w-full h-12 bg-black border border-green-800 pl-10 pr-4 text-green-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-30 disabled:bg-neutral-950/30 disabled:border-green-955 disabled:text-green-800/40 transition-all font-mono shadow-[inset_0_0_10px_rgba(0,255,65,0.05)]"
                />
              </div>
              <button 
                type="submit"
                disabled={!isFileUploaded || !query.trim() || isChatting}
                className="h-12 bg-green-800 hover:bg-green-600 text-black font-bold px-6 transition-colors border border-green-700 disabled:opacity-30 disabled:hover:bg-green-800 cursor-pointer shadow-[0_0_10px_rgba(0,255,65,0.2)]"
              >
                SEND
              </button>
            </form>
            
            <div className="mt-2 text-[10px] text-green-700/80 text-center font-mono uppercase tracking-wider">
              supported format is pdf txt scv xlsx docx json
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
