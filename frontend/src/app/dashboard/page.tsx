'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Database, 
  UploadCloud, 
  Trash2, 
  LogOut, 
  User, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Send, 
  Sparkles, 
  ChevronRight,
  Loader2,
  FileCode,
  CornerDownLeft
} from 'lucide-react';

interface UserProfile {
  id: number;
  email: string;
  name: string | null;
  picture_url: string | null;
}

interface DocumentInfo {
  id: number;
  filename: string;
  upload_timestamp: string;
  status: 'processing' | 'active' | 'error';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: {
    filename: string;
    page: number | null;
    content: string;
  }[];
}

export default function Dashboard() {
  const router = useRouter();
  
  // State variables
  const [activeTab, setActiveTab] = useState<'chat' | 'documents'>('chat');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  
  // Chat state
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [selectedSource, setSelectedSource] = useState<any | null>(null);

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // 1. Fetch user data and documents on mount
  useEffect(() => {
    // Load cached user profile
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    fetchDocuments();
  }, []);

  // 2. Poll document statuses if any is in 'processing' state
  useEffect(() => {
    const hasProcessing = documents.some(doc => doc.status === 'processing');
    if (hasProcessing) {
      const interval = setInterval(() => {
        fetchDocuments(true); // silent fetch
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [documents]);

  // 3. Scroll to chat end when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatting]);

  const getClientToken = () => {
    if (typeof document === 'undefined') return '';
    return document.cookie.split('; ').find(row => row.startsWith('access_token='))?.split('=')[1] || '';
  };

  const fetchDocuments = async (silent = false) => {
    if (!silent) setLoadingDocs(true);
    try {
      const res = await fetch(`${backendUrl}/api/documents`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getClientToken()}`
        },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      if (!silent) setLoadingDocs(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getClientToken()}`
        },
        credentials: 'include',
      });
    } catch (err) {
      console.error('Error logging out:', err);
    } finally {
      // Clear client session cookies and local storage
      document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax";
      localStorage.removeItem('user');
      router.push('/login');
    }
  };

  const handleDeleteDocument = async (id: number) => {
    try {
      const res = await fetch(`${backendUrl}/api/documents/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getClientToken()}`
        },
        credentials: 'include',
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== id));
        // Reset source preview if it belonged to deleted file
        setSelectedSource(null);
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to delete document');
      }
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isChatting) return;

    setQuery('');
    setChatHistory(prev => [...prev, { role: 'user', content: trimmedQuery }]);
    setIsChatting(true);

    try {
      const res = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getClientToken()}`
        },
        body: JSON.stringify({ query: trimmedQuery }),
        credentials: 'include',
      });

      const data = await res.json();
      if (res.ok) {
        setChatHistory(prev => [
          ...prev, 
          { 
            role: 'assistant', 
            content: data.answer, 
            sources: data.sources 
          }
        ]);
      } else {
        setChatHistory(prev => [
          ...prev, 
          { 
            role: 'assistant', 
            content: data.detail || 'An error occurred during search retrieval.' 
          }
        ]);
      }
    } catch (err) {
      setChatHistory(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: 'Unable to connect to the search endpoint.' 
        }
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    const validExtensions = ['.pdf', '.txt', '.csv', '.xlsx', '.docx', '.json'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setUploadError(`Invalid extension. Supported formats are: ${validExtensions.join(', ')}`);
      setUploadSuccess(null);
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getClientToken()}`
        },
        body: formData,
        credentials: 'include',
      });

      const data = await res.json();
      if (res.ok) {
        setUploadSuccess(`Successfully queued "${file.name}" for vector ingestion!`);
        fetchDocuments();
      } else {
        setUploadError(data.detail || 'Upload failed.');
      }
    } catch (err) {
      setUploadError('Network connection failed during upload.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Helper for parsing inline bold and code
  const renderStyledText = (text: string) => {
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
        tokens.push(<strong key={keyIdx++} className="font-semibold text-white">{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
      } else if (codeMatch) {
        if (codeMatch[1]) {
          tokens.push(<span key={keyIdx++}>{codeMatch[1]}</span>);
        }
        tokens.push(
          <code key={keyIdx++} className="bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded font-mono text-emerald-400 text-xs">
            {codeMatch[2]}
          </code>
        );
        remaining = codeMatch[3];
      } else {
        tokens.push(<span key={keyIdx++}>{remaining}</span>);
        break;
      }
    }
    return tokens;
  };

  const renderMessageContent = (content: string) => {
    // Split code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        let language = 'code';
        let code = part.slice(3, -3).trim();

        if (lines.length > 0 && /^[a-zA-Z0-9_-]+$/.test(lines[0])) {
          language = lines[0];
          code = lines.slice(1).join('\n');
        }

        return (
          <div key={index} className="my-4 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950 font-mono text-xs">
            <div className="bg-zinc-900 px-4 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest flex items-center justify-between border-b border-zinc-850">
              <span>{language}</span>
              <FileCode className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <pre className="p-4 overflow-x-auto text-zinc-300">
              <code>{code}</code>
            </pre>
          </div>
        );
      } else {
        const lines = part.split('\n');
        return (
          <div key={index} className="space-y-2 font-sans text-sm leading-relaxed text-zinc-300">
            {lines.map((line, lIdx) => {
              if (line.trim() === '') return <div key={lIdx} className="h-2" />;
              
              // Lists
              if (line.startsWith('- ') || line.startsWith('* ')) {
                return (
                  <ul key={lIdx} className="list-disc pl-5 space-y-1">
                    <li>{renderStyledText(line.substring(2))}</li>
                  </ul>
                );
              }
              if (/^\d+\.\s/.test(line)) {
                const match = line.match(/^(\d+)\.\s(.*)$/);
                return (
                  <ol key={lIdx} className="list-decimal pl-5 space-y-1">
                    <li value={match ? parseInt(match[1]) : undefined}>
                      {renderStyledText(match ? match[2] : line)}
                    </li>
                  </ol>
                );
              }
              // Headings
              if (line.startsWith('#')) {
                const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
                if (hMatch) {
                  const hLvl = hMatch[1].length;
                  const hText = renderStyledText(hMatch[2]);
                  const classes = hLvl === 1 ? 'text-xl font-bold mt-4 mb-2 text-white border-b border-zinc-800 pb-1' :
                                  hLvl === 2 ? 'text-lg font-bold mt-3 mb-2 text-white' :
                                  'text-md font-bold mt-2 mb-1 text-zinc-200';
                  return React.createElement(`h${hLvl}`, { key: lIdx, className: classes }, hText);
                }
              }

              return <p key={lIdx}>{renderStyledText(line)}</p>;
            })}
          </div>
        );
      }
    });
  };

  const activeDocsCount = documents.filter(doc => doc.status === 'active').length;

  return (
    <div className="w-full min-h-screen bg-black flex overflow-hidden">
      
      {/* ==========================================
          SIDEBAR PANEL
          ========================================== */}
      <div className="w-64 border-r border-zinc-850 bg-zinc-950 flex flex-col justify-between flex-shrink-0 relative z-20">
        <div className="flex flex-col flex-1">
          {/* Logo Brand */}
          <div className="h-16 px-6 border-b border-zinc-850 flex items-center justify-between">
            <span className="text-lg font-bold font-mono tracking-tight text-white flex items-center gap-1.5">
              Docu<span className="text-green-500">Mind</span>
            </span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-medium">Secured</span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1 flex-1">
            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left text-sm ${
                activeTab === 'chat'
                  ? 'bg-zinc-900 text-white border border-zinc-800'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-green-500" />
              <div className="flex-1">
                <p className="font-semibold">AI Workspace</p>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Isolated Query</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab('documents')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left text-sm ${
                activeTab === 'documents'
                  ? 'bg-zinc-900 text-white border border-zinc-800'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <Database className="w-4 h-4 text-green-500" />
              <div className="flex-1">
                <p className="font-semibold">Document Vault</p>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Ingest & Manage</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>
          </nav>
        </div>

        {/* User Account Box */}
        {user && (
          <div className="p-4 border-t border-zinc-850 bg-zinc-950/90 flex flex-col space-y-3">
            <div className="flex items-center gap-3">
              {user.picture_url ? (
                <img 
                  src={user.picture_url} 
                  alt="avatar" 
                  className="w-10 h-10 rounded-full border border-zinc-800"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white uppercase text-sm font-semibold">
                  {user.email.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.name || 'DocuMind User'}</p>
                <p className="text-[10px] text-zinc-500 truncate font-mono mt-0.5">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-red-950/20 hover:text-red-400 border border-zinc-800 hover:border-red-900/30 text-xs font-semibold transition-all duration-250 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Terminate Session</span>
            </button>
          </div>
        )}
      </div>

      {/* ==========================================
          MAIN CONTENT WORKSPACE
          ========================================== */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        
        {/* Decorative ambient background lights */}
        <div className="absolute top-10 right-20 w-80 h-80 bg-green-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            
            /* ==========================================
                CHAT WORKSPACE
                ========================================== */
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex min-h-0"
            >
              {/* Main Chat Panel */}
              <div className="flex-1 flex flex-col min-w-0 h-full border-r border-zinc-850/60 bg-black/40">
                {/* Header */}
                <div className="h-16 px-6 border-b border-zinc-850 flex items-center justify-between bg-zinc-950/10 backdrop-blur-sm flex-shrink-0">
                  <div>
                    <h2 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                      Secured Chat Console
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      Isolated from other users. Currently indexing {activeDocsCount} documents.
                    </p>
                  </div>
                </div>

                {/* Message Stream */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/10">
                  {chatHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto space-y-4">
                      <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.05)]">
                        <Sparkles className="w-6 h-6 animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-white text-sm font-semibold uppercase tracking-wider font-mono">
                          Vault Assistant Standby
                        </h3>
                        <p className="text-zinc-500 text-xs leading-relaxed">
                          Ask questions regarding any of your uploaded files. All context matches are verified and constrained strictly to your documents.
                        </p>
                      </div>
                      {activeDocsCount === 0 && (
                        <button 
                          onClick={() => setActiveTab('documents')}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-black text-xs font-semibold rounded-lg transition-colors border border-green-400 shadow-[0_0_10px_rgba(34,197,94,0.2)]"
                        >
                          Upload documents first
                        </button>
                      )}
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className={`flex gap-4 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                      >
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full border flex-shrink-0 flex items-center justify-center text-xs font-semibold uppercase font-mono ${
                          msg.role === 'user' 
                            ? 'bg-zinc-900 border-zinc-700 text-green-400' 
                            : 'bg-green-950/20 border-green-500/40 text-green-400'
                        }`}>
                          {msg.role === 'user' ? 'U' : 'AI'}
                        </div>

                        {/* Content Card */}
                        <div className={`flex flex-col space-y-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                          <div className={`p-4 rounded-xl border ${
                            msg.role === 'user'
                              ? 'bg-zinc-900/40 border-zinc-850/80 rounded-tr-none'
                              : 'bg-zinc-950/70 border-zinc-850/80 rounded-tl-none shadow-lg'
                          }`}>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono mb-2">
                              {msg.role === 'user' ? 'User Prompt' : 'AI Assistant'}
                            </div>
                            {renderMessageContent(msg.content)}
                          </div>

                          {/* Source Citations */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <span className="text-[9px] text-zinc-500 font-mono self-center mr-1 uppercase">Sources:</span>
                              {msg.sources.map((src, sIdx) => (
                                <button
                                  key={sIdx}
                                  onClick={() => setSelectedSource(src)}
                                  className="px-2 py-0.5 text-[10px] bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-green-400 rounded transition-all font-mono"
                                >
                                  {src.filename} {src.page ? `(p. ${src.page})` : ''}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))
                  )}

                  {/* Thinking Loader */}
                  {isChatting && (
                    <div className="flex gap-4 max-w-lg">
                      <div className="w-8 h-8 rounded-full border bg-green-950/20 border-green-500/30 text-green-400 flex items-center justify-center text-xs font-semibold animate-pulse">
                        AI
                      </div>
                      <div className="p-4 rounded-xl border bg-zinc-950/50 border-zinc-900 rounded-tl-none flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-green-500 animate-spin" />
                        <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Searching isolated chunks...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Prompt Form */}
                <div className="p-4 border-t border-zinc-850/60 bg-zinc-950/20 backdrop-blur flex-shrink-0">
                  <form onSubmit={handleChatSubmit} className="max-w-3xl mx-auto flex gap-2 relative">
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      disabled={activeDocsCount === 0 || isChatting}
                      placeholder={
                        activeDocsCount === 0 
                          ? "Vault is empty. Ingest documents to query..." 
                          : "Input query regarding your files..."
                      }
                      className="flex-1 h-12 bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-12 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-30 disabled:bg-neutral-900/10 font-sans shadow-[inset_0_0_10px_rgba(0,255,65,0.01)]"
                    />
                    <button
                      type="submit"
                      disabled={activeDocsCount === 0 || !query.trim() || isChatting}
                      className="absolute right-2 top-2 h-8 w-8 flex items-center justify-center rounded-lg bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 text-black disabled:text-zinc-600 transition-all cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                  <p className="text-center text-[9px] text-zinc-600 font-mono uppercase tracking-widest mt-2">
                    Queries are restricted to metadata tagged with user_id = {user?.id}
                  </p>
                </div>
              </div>

              {/* Source Details Sidebar Drawer */}
              <AnimatePresence>
                {selectedSource && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 340 }}
                    exit={{ opacity: 0, width: 0 }}
                    className="border-l border-zinc-850 bg-zinc-950 flex flex-col h-full flex-shrink-0 z-10 overflow-hidden"
                  >
                    <div className="h-16 px-4 border-b border-zinc-850 flex items-center justify-between bg-zinc-900/20 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">Source Match</span>
                      </div>
                      <button 
                        onClick={() => setSelectedSource(null)}
                        className="text-[10px] text-zinc-400 hover:text-white uppercase font-mono px-2 py-1 rounded bg-zinc-900 border border-zinc-800"
                      >
                        Close
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Document Name</p>
                        <p className="text-xs font-semibold text-white mt-1 break-all">{selectedSource.filename}</p>
                      </div>
                      
                      {selectedSource.page && (
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Page Reference</p>
                          <p className="text-xs text-white font-semibold mt-1">Page {selectedSource.page}</p>
                        </div>
                      )}

                      <div className="border-t border-zinc-850/60 pt-4">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono mb-2">Retrieved Context Chunk</p>
                        <div className="bg-black/60 border border-zinc-900 rounded-lg p-3 text-xs leading-relaxed text-zinc-400 font-sans select-text">
                          {selectedSource.content}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            
            /* ==========================================
                DOCUMENTS VAULT & UPLOAD
                ========================================== */
            <motion.div
              key="documents"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col p-8 max-w-5xl mx-auto w-full space-y-8 overflow-y-auto custom-scrollbar"
            >
              {/* Header */}
              <div>
                <h2 className="text-2xl font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-6 h-6 text-green-500" />
                  Document Vault
                </h2>
                <p className="text-zinc-500 text-xs mt-1">
                  Upload and manage documents. Files are chunked and secured under your private ID.
                </p>
              </div>

              {/* Upload Drop Zone Card */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-10 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                  dragActive 
                    ? 'border-green-500 bg-green-950/10' 
                    : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-950/60'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.txt,.csv,.xlsx,.docx,.json"
                />

                <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-4 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
                  ) : (
                    <UploadCloud className="w-6 h-6 text-green-500" />
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">
                    {uploading ? 'Parsing and generating embeddings...' : 'Drag & drop file or click to select'}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Supports PDF, TXT, CSV, XLSX, DOCX, JSON up to 15MB
                  </p>
                </div>

                {uploadError && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-4 p-2.5 rounded bg-red-950/20 border border-red-900/40 text-red-300 text-xs flex items-center gap-2"
                    onClick={e => e.stopPropagation()}
                  >
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span>{uploadError}</span>
                  </motion.div>
                )}

                {uploadSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-4 p-2.5 rounded bg-green-950/20 border border-green-900/40 text-green-300 text-xs flex items-center gap-2"
                    onClick={e => e.stopPropagation()}
                  >
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span>{uploadSuccess}</span>
                  </motion.div>
                )}
              </div>

              {/* Table / Grid list */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-widest">
                  Vault Inventory ({documents.length} files)
                </h3>

                {loadingDocs ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-500 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                    <span className="text-xs font-mono uppercase tracking-wider">Syncing database...</span>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="border border-zinc-850 rounded-xl bg-zinc-950/30 p-12 text-center flex flex-col items-center justify-center space-y-3">
                    <FileText className="w-8 h-8 text-zinc-700" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-400">No documents indexed</p>
                      <p className="text-xs text-zinc-600">Your secure workspace requires source files to support RAG operations.</p>
                    </div>
                  </div>
                ) : (
                  <div className="border border-zinc-850 rounded-xl bg-zinc-950/20 overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs select-text">
                      <thead>
                        <tr className="bg-zinc-900/40 border-b border-zinc-850/80 text-zinc-400 font-mono uppercase tracking-wider">
                          <th className="p-4 font-semibold">Filename</th>
                          <th className="p-4 font-semibold">Upload Date</th>
                          <th className="p-4 font-semibold">Ingest Status</th>
                          <th className="p-4 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc, idx) => (
                          <tr 
                            key={doc.id} 
                            className={`border-b border-zinc-850/40 transition-colors ${
                              idx % 2 === 0 ? 'bg-zinc-950/10' : 'bg-transparent'
                            }`}
                          >
                            <td className="p-4 font-semibold text-white flex items-center gap-2.5">
                              <FileText className="w-4 h-4 text-green-500/80" />
                              <span className="truncate max-w-xs md:max-w-md" title={doc.filename}>{doc.filename}</span>
                            </td>
                            <td className="p-4 text-zinc-500 font-mono">
                              {new Date(doc.upload_timestamp).toLocaleString()}
                            </td>
                            <td className="p-4">
                              {doc.status === 'active' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-950/40 text-green-400 border border-green-900/50 shadow-[0_0_10px_rgba(34,197,94,0.05)]">
                                  <span className="w-1 h-1 rounded-full bg-green-400"></span>
                                  Active (Ready)
                                </span>
                              )}
                              {doc.status === 'processing' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/40 text-amber-400 border border-amber-900/50 animate-pulse">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  Ingesting...
                                </span>
                              )}
                              {doc.status === 'error' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/40 text-red-400 border border-red-900/50">
                                  <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                                  Failed
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="p-2 rounded bg-zinc-900 hover:bg-red-950/30 hover:text-red-400 border border-zinc-800 hover:border-red-900/40 transition-all cursor-pointer"
                                title="Delete document"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
