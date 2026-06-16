'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Database,
  UploadCloud,
  Trash2,
  LogOut,
  FileText,
  CheckCircle,
  AlertTriangle,
  Send,
  BrainCircuit,
  Loader2,
  FileCode,
  Plus,
  Moon,
  Sun,
  ChevronLeft,
  ExternalLink,
  X,
  History,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id        : number;
  email     : string;
  name      : string | null;
  picture_url: string | null;
}

interface DocumentInfo {
  id              : number;
  filename        : string;
  upload_timestamp: string;
  status          : 'processing' | 'active' | 'error';
}

interface Citation {
  filename: string;
  page    : number | null;
  score   : number;
  preview : string;
}

interface ChatMessage {
  role   : 'user' | 'assistant';
  content: string;
  sources?: Citation[];
  streaming?: boolean; // true while token-by-token rendering is in progress
}

interface ChatSession {
  chat_id   : number;
  title     : string;
  created_at: string;
}

// ─── Theme hook ───────────────────────────────────────────────────────────────

function useTheme() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved  = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return { dark, toggle };
}

// ─── Markdown renderer (unchanged from original + theme-aware classes) ────────

function renderStyledText(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx    = 0;

  while (remaining) {
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*(.*?)\*\*([\s\S]*)$/);
    const codeMatch = remaining.match(/^([\s\S]*?)`(.*?)`([\s\S]*)$/);
    const boldIdx   = boldMatch ? boldMatch[1].length : -1;
    const codeIdx   = codeMatch ? codeMatch[1].length : -1;

    if (boldMatch && (codeIdx === -1 || boldIdx < codeIdx)) {
      if (boldMatch[1]) tokens.push(<span key={keyIdx++}>{boldMatch[1]}</span>);
      tokens.push(
        <strong key={keyIdx++} style={{ color: 'var(--text)' }}>
          {boldMatch[2]}
        </strong>
      );
      remaining = boldMatch[3];
    } else if (codeMatch) {
      if (codeMatch[1]) tokens.push(<span key={keyIdx++}>{codeMatch[1]}</span>);
      tokens.push(
        <code
          key      = {keyIdx++}
          className= "px-1 py-0.5 rounded text-xs font-mono"
          style    = {{ background: 'var(--bg-3)', color: 'var(--accent)' }}
        >
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
}

function renderMessageContent(content: string): React.ReactNode {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines  = part.slice(3, -3).trim().split('\n');
      let language = 'code';
      let code     = part.slice(3, -3).trim();
      if (lines.length > 0 && /^[a-zA-Z0-9_-]+$/.test(lines[0])) {
        language = lines[0];
        code     = lines.slice(1).join('\n');
      }
      return (
        <div
          key      = {index}
          className= "my-3 rounded-xl overflow-hidden font-mono text-xs"
          style    = {{ border: '1px solid var(--border)' }}
        >
          <div
            className= "px-4 py-1.5 text-[10px] uppercase tracking-widest flex items-center justify-between"
            style    = {{ background: 'var(--bg-3)', color: 'var(--text-3)' }}
          >
            <span>{language}</span>
            <FileCode className="w-3.5 h-3.5" />
          </div>
          <pre className="p-4 overflow-x-auto text-sm" style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>
            <code>{code}</code>
          </pre>
        </div>
      );
    }

    const lines = part.split('\n');
    return (
      <div key={index} className="space-y-2 text-sm leading-relaxed">
        {lines.map((line, lIdx) => {
          if (line.trim() === '') return <div key={lIdx} className="h-1.5" />;

          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <ul key={lIdx} className="list-disc pl-5 space-y-0.5">
                <li>{renderStyledText(line.substring(2))}</li>
              </ul>
            );
          }
          if (/^\d+\.\s/.test(line)) {
            const m = line.match(/^(\d+)\.\s(.*)$/);
            return (
              <ol key={lIdx} className="list-decimal pl-5 space-y-0.5">
                <li value={m ? parseInt(m[1]) : undefined}>
                  {renderStyledText(m ? m[2] : line)}
                </li>
              </ol>
            );
          }
          if (line.startsWith('#')) {
            const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (hMatch) {
              const hLvl    = hMatch[1].length;
              const hText   = renderStyledText(hMatch[2]);
              const classes =
                hLvl === 1 ? 'text-lg font-bold mt-4 mb-2' :
                hLvl === 2 ? 'text-base font-bold mt-3 mb-1' :
                             'text-sm font-bold mt-2 mb-1';
              return React.createElement(`h${hLvl}`, {
                key      : lIdx,
                className: classes,
                style    : { color: 'var(--text)' },
              }, hText);
            }
          }
          return <p key={lIdx} style={{ color: 'var(--text-2)' }}>{renderStyledText(line)}</p>;
        })}
      </div>
    );
  });
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router         = useRouter();
  const { dark, toggle } = useTheme();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState<'chat' | 'documents'>('chat');
  const [user,           setUser]           = useState<UserProfile | null>(null);
  const [documents,      setDocuments]      = useState<DocumentInfo[]>([]);
  const [loadingDocs,    setLoadingDocs]    = useState(true);

  // Chat state (V2.20)
  const [query,          setQuery]          = useState('');
  const [chatHistory,    setChatHistory]    = useState<ChatMessage[]>([]);
  const [isChatting,     setIsChatting]     = useState(false);
  const [currentChatId,  setCurrentChatId]  = useState<number | null>(null);
  const [chatSessions,   setChatSessions]   = useState<ChatSession[]>([]);
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // Upload state
  const [dragActive,     setDragActive]     = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [uploadError,    setUploadError]    = useState<string | null>(null);
  const [uploadSuccess,  setUploadSuccess]  = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getClientToken = () => {
    if (typeof document === 'undefined') return '';
    return (
      document.cookie
        .split('; ')
        .find(row => row.startsWith('access_token='))
        ?.split('=')[1] || ''
    );
  };

  const authHeaders = () => ({
    Authorization: `Bearer ${getClientToken()}`,
  });

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async (silent = false) => {
    if (!silent) setLoadingDocs(true);
    try {
      const res = await fetch(`${backendUrl}/api/documents`, {
        headers    : authHeaders(),
        credentials: 'include',
      });
      if (res.ok) setDocuments(await res.json());
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      if (!silent) setLoadingDocs(false);
    }
  }, [backendUrl]);

  const fetchChatSessions = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/chats`, {
        headers    : authHeaders(),
        credentials: 'include',
      });
      if (res.ok) setChatSessions(await res.json());
    } catch (err) {
      console.error('Error fetching chat sessions:', err);
    }
  }, [backendUrl]);

  // Load a past chat session into the UI
  const loadChatSession = async (chatId: number) => {
    try {
      const res = await fetch(`${backendUrl}/api/chats/${chatId}/messages`, {
        headers    : authHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const msgs: any[] = await res.json();
        setChatHistory(
          msgs.map(m => ({
            role   : m.role,
            content: m.content,
            sources: m.sources || [],
          }))
        );
        setCurrentChatId(chatId);
        setSessionPanelOpen(false);
        setActiveTab('chat');
      }
    } catch (err) {
      console.error('Error loading chat session:', err);
    }
  };

  const deleteChatSession = async (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${backendUrl}/api/chats/${chatId}`, {
        method     : 'DELETE',
        headers    : authHeaders(),
        credentials: 'include',
      });
      setChatSessions(prev => prev.filter(s => s.chat_id !== chatId));
      if (currentChatId === chatId) startNewChat();
    } catch (err) {
      console.error('Error deleting chat session:', err);
    }
  };

  // ── Mount effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
    fetchDocuments();
    fetchChatSessions();
  }, []);

  // Poll if any document is still processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(() => fetchDocuments(true), 4000);
    return () => clearInterval(interval);
  }, [documents]);

  // Scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatting]);

  // Auto-resize textarea
  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const startNewChat = () => {
    setChatHistory([]);
    setCurrentChatId(null);
    setSelectedCitation(null);
    setActiveTab('chat');
    setSessionPanelOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/api/auth/logout`, {
        method     : 'POST',
        headers    : authHeaders(),
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
      localStorage.removeItem('user');
      router.push('/login');
    }
  };

  const handleDeleteDocument = async (id: number) => {
    try {
      const res = await fetch(`${backendUrl}/api/documents/${id}`, {
        method     : 'DELETE',
        headers    : authHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== id));
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to delete document');
      }
    } catch (err) {
      console.error('Delete document error:', err);
    }
  };

  // ── Streaming chat submit ──────────────────────────────────────────────────

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isChatting) return;

    setQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Append user message immediately
    setChatHistory(prev => [...prev, { role: 'user', content: trimmedQuery }]);
    setIsChatting(true);

    // Placeholder streaming assistant message
    const assistantPlaceholderIdx = chatHistory.length + 1;
    setChatHistory(prev => [
      ...prev,
      { role: 'assistant', content: '', streaming: true, sources: [] },
    ]);

    try {
      const res = await fetch(`${backendUrl}/api/chat`, {
        method     : 'POST',
        headers    : { 'Content-Type': 'application/json', ...authHeaders() },
        body       : JSON.stringify({
          query  : trimmedQuery,
          chat_id: currentChatId,
        }),
        credentials: 'include',
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Request failed');
      }

      // ── Stream SSE tokens ────────────────────────────────────────────────
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   fullAnswer = '';
      let   citations : Citation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const payload = line.replace('data: ', '');

          if (payload.startsWith('[DONE]')) {
            // Parse the final metadata from the [DONE] event
            try {
              const meta = JSON.parse(payload.replace('[DONE] ', ''));
              citations  = meta.citations || [];
              if (meta.chat_id) {
                setCurrentChatId(meta.chat_id);
              }
              // Always refresh so history panel stays up to date
              fetchChatSessions();
            } catch (err) {
              console.error('Error parsing DONE payload:', err);
            }
          } else {
            // Append the token to the streaming message
            fullAnswer += payload;
            setChatHistory(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role     : 'assistant',
                content  : fullAnswer,
                streaming: true,
                sources  : [],
              };
              return updated;
            });
          }
        }
      }

      // ── Finalise the message (remove streaming flag, attach citations) ──
      setChatHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role   : 'assistant',
          content: fullAnswer,
          sources: citations,
        };
        return updated;
      });

    } catch (err: any) {
      setChatHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role   : 'assistant',
          content: err.message || 'Unable to connect to the server.',
        };
        return updated;
      });
    } finally {
      setIsChatting(false);
    }
  };

  // Submit on Enter (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e as any);
    }
  };

  // ── File upload ────────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) uploadFile(e.dataTransfer.files[0]);
  };

  const uploadFile = async (file: File) => {
    const validExtensions = ['.pdf', '.txt', '.csv', '.xlsx', '.docx', '.json'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(ext)) {
      setUploadError(`Unsupported file type. Allowed: ${validExtensions.join(', ')}`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${backendUrl}/api/upload`, {
        method     : 'POST',
        headers    : authHeaders(),
        body       : formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setUploadSuccess(`"${file.name}" uploaded and queued for embedding.`);
        fetchDocuments();
      } else {
        setUploadError(data.detail || 'Upload failed.');
      }
    } catch {
      setUploadError('Network error during upload.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const activeDocsCount = documents.filter(d => d.status === 'active').length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen flex overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ════════════════════════════════════════════════════════════════════
          SIDEBAR
          ════════════════════════════════════════════════════════════════════ */}
      <aside
        className="w-60 flex flex-col flex-shrink-0 relative z-20"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        {/* Brand */}
        <div
          className="h-14 px-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-base font-bold tracking-tight font-mono flex items-center gap-1.5"
                style={{ color: 'var(--text)' }}>
            <BrainCircuit className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            Docu<span style={{ color: 'var(--accent)' }}>Mind</span>
          </span>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            id="theme-toggle-sidebar"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--bg-2)' }}
            title="Toggle theme"
          >
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* New Chat button */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={startNewChat}
            id="new-chat-btn"
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'var(--accent-glow)',
              border    : '1px solid var(--border)',
              color     : 'var(--accent)',
            }}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-1">
          {[
            { key: 'chat' as const,      icon: MessageSquare, label: 'Chat',      sub: `${activeDocsCount} docs active` },
            { key: 'documents' as const, icon: Database,      label: 'Documents', sub: `${documents.length} uploaded` },
          ].map(({ key, icon: Icon, label, sub }) => (
            <button
              key       = {key}
              onClick   = {() => setActiveTab(key)}
              id        = {`nav-${key}`}
              className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all"
              style={{
                background: activeTab === key ? 'var(--bg-2)'  : 'transparent',
                border    : `1px solid ${activeTab === key ? 'var(--border-2)' : 'transparent'}`,
                color     : activeTab === key ? 'var(--text)'  : 'var(--text-3)',
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{label}</p>
                <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-4)' }}>{sub}</p>
              </div>
            </button>
          ))}
        </nav>

        {/* Chat History Panel toggle */}
        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setSessionPanelOpen(!sessionPanelOpen)}
            id="history-btn"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
            style={{
              background: 'var(--bg-2)',
              border    : '1px solid var(--border)',
              color     : 'var(--text-3)',
            }}
          >
            <History className="w-3.5 h-3.5" />
            Chat History
            <span
              className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-mono"
              style={{ background: 'var(--bg-3)', color: 'var(--text-4)' }}
            >
              {chatSessions.length}
            </span>
          </button>
        </div>

        {/* User info + Logout */}
        {user && (
          <div
            className="p-3 mt-auto flex-shrink-0 space-y-3"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2.5">
              {user.picture_url ? (
                <img src={user.picture_url} alt="avatar"
                     className="w-8 h-8 rounded-full flex-shrink-0"
                     style={{ border: '1px solid var(--border)' }} />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                     style={{ background: 'var(--bg-3)', color: 'var(--text)' }}>
                  {user.email.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {user.name || 'User'}
                </p>
                <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-4)' }}>
                  {user.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              id="logout-btn"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
              style={{
                background: 'var(--bg-2)',
                border    : '1px solid var(--border)',
                color     : 'var(--text-3)',
              }}
              onMouseEnter = {e => {
                (e.currentTarget as HTMLElement).style.color      = 'var(--red)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)';
              }}
              onMouseLeave = {e => {
                (e.currentTarget as HTMLElement).style.color      = 'var(--text-3)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* ════════════════════════════════════════════════════════════════════
          CHAT HISTORY SLIDE-OVER PANEL
          ════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {sessionPanelOpen && (
          <motion.div
            initial   = {{ x: -300, opacity: 0 }}
            animate   = {{ x: 0, opacity: 1 }}
            exit      = {{ x: -300, opacity: 0 }}
            transition= {{ type: 'spring', stiffness: 280, damping: 28 }}
            className = "absolute left-60 top-0 bottom-0 w-64 z-30 flex flex-col"
            style     = {{ background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}
          >
            {/* Header */}
            <div
              className="h-14 px-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Chat History
              </span>
              <button
                onClick={() => setSessionPanelOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ color: 'var(--text-3)', background: 'var(--bg-2)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {chatSessions.length === 0 ? (
                <p className="text-xs text-center py-8 font-mono" style={{ color: 'var(--text-4)' }}>
                  No previous chats
                </p>
              ) : (
                chatSessions.map(session => (
                  <button
                    key       = {session.chat_id}
                    onClick   = {() => loadChatSession(session.chat_id)}
                    className = "w-full group flex items-start gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                    style={{
                      background  : currentChatId === session.chat_id ? 'var(--bg-3)' : 'transparent',
                      border      : `1px solid ${currentChatId === session.chat_id ? 'var(--border-2)' : 'transparent'}`,
                    }}
                    onMouseEnter = {e => { if (currentChatId !== session.chat_id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'; }}
                    onMouseLeave = {e => { if (currentChatId !== session.chat_id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-4)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                        {session.title}
                      </p>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-4)' }}>
                        {new Date(session.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick    = {(e) => deleteChatSession(session.chat_id, e)}
                      className  = "opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded flex-shrink-0 transition-opacity"
                      style      = {{ color: 'var(--red)' }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
          ════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <AnimatePresence mode="wait">

          {/* ──────────────────────────────────────────────────────────────────
              CHAT VIEW
              ────────────────────────────────────────────────────────────────── */}
          {activeTab === 'chat' && (
            <motion.div
              key        = "chat"
              initial    = {{ opacity: 0, x: 16 }}
              animate    = {{ opacity: 1, x: 0 }}
              exit       = {{ opacity: 0, x: -16 }}
              transition = {{ duration: 0.2 }}
              className  = "flex-1 flex min-h-0" style={{ height: '100%' }}
            >
              {/* Chat column */}
              <div
                className="flex-1 flex flex-col min-w-0"
                style={{ borderRight: selectedCitation ? '1px solid var(--border)' : 'none', minHeight: 0 }}
              >
                {/* Chat header */}
                <div
                  className="h-14 px-5 flex items-center justify-between flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {currentChatId ? `Chat #${currentChatId}` : 'New Conversation'}
                    </h2>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--text-4)' }}>
                      {activeDocsCount} document{activeDocsCount !== 1 ? 's' : ''} in scope
                    </p>
                  </div>

                  {chatHistory.length > 0 && (
                    <button
                      onClick   = {startNewChat}
                      className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: 'var(--bg-2)',
                        border    : '1px solid var(--border)',
                        color     : 'var(--text-3)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New
                    </button>
                  )}
                </div>

                {/* Message stream */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5"
                     style={{ background: 'var(--bg)' }}>

                  {/* Empty state */}
                  {chatHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-sm mx-auto">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{
                          background: 'var(--accent-glow)',
                          border    : '1px solid var(--border)',
                        }}
                      >
                        <BrainCircuit className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          Ask anything about your documents
                        </h3>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                          Answers are generated strictly from your uploaded files — no external knowledge used.
                        </p>
                      </div>
                      {activeDocsCount === 0 && (
                        <button
                          onClick   = {() => setActiveTab('documents')}
                          className = "px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            background: 'var(--accent)',
                            color     : '#fff',
                          }}
                        >
                          Upload documents first →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Messages */}
                  {chatHistory.map((msg, idx) => (
                    <motion.div
                      key        = {idx}
                      initial    = {{ opacity: 0, y: 12 }}
                      animate    = {{ opacity: 1, y: 0 }}
                      transition = {{ duration: 0.25 }}
                      className  = {`flex gap-3 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                    >
                      {/* Avatar */}
                      <div
                        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold font-mono"
                        style={{
                          background: msg.role === 'user' ? 'var(--bg-3)' : 'var(--accent-glow)',
                          border    : `1px solid ${msg.role === 'user' ? 'var(--border-2)' : 'var(--accent)'}`,
                          color     : msg.role === 'user' ? 'var(--text-2)' : 'var(--accent)',
                        }}
                      >
                        {msg.role === 'user' ? 'U' : 'AI'}
                      </div>

                      {/* Bubble */}
                      <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div
                          className="px-4 py-3 rounded-2xl"
                          style={{
                            background: msg.role === 'user' ? 'var(--bg-3)' : 'var(--surface)',
                            border    : '1px solid var(--border)',
                            borderTopRightRadius: msg.role === 'user' ? 4 : undefined,
                            borderTopLeftRadius : msg.role !== 'user' ? 4 : undefined,
                          }}
                        >
                          {msg.content ? (
                            <div className={msg.streaming ? 'cursor-blink' : ''}>
                              {renderMessageContent(msg.content)}
                            </div>
                          ) : (
                            // Still waiting for first token
                            <div className="flex items-center gap-2 py-0.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
                              <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                                Searching…
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Citations */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[9px] font-mono self-center" style={{ color: 'var(--text-4)' }}>
                              Sources:
                            </span>
                            {msg.sources.map((src, sIdx) => (
                              <button
                                key       = {sIdx}
                                onClick   = {() => setSelectedCitation(src)}
                                className = "px-2 py-0.5 text-[10px] rounded-lg font-mono transition-all"
                                style={{
                                  background: 'var(--bg-2)',
                                  border    : '1px solid var(--border)',
                                  color     : 'var(--text-3)',
                                }}
                                onMouseEnter = {e => {
                                  (e.currentTarget as HTMLElement).style.color       = 'var(--accent)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
                                }}
                                onMouseLeave = {e => {
                                  (e.currentTarget as HTMLElement).style.color       = 'var(--text-3)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                }}
                              >
                                {src.filename}{src.page ? ` · p${src.page}` : ''}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  <div ref={chatEndRef} />
                </div>

                {/* Input bar */}
                <div
                  className="p-4 flex-shrink-0"
                  style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <form
                    onSubmit  = {handleChatSubmit}
                    className = "max-w-3xl mx-auto flex items-end gap-2"
                  >
                    <div
                      className="flex-1 flex items-end rounded-xl overflow-hidden"
                      style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                    >
                      <textarea
                        ref         = {textareaRef}
                        rows        = {1}
                        value       = {query}
                        onChange    = {e => setQuery(e.target.value)}
                        onInput     = {handleTextareaInput}
                        onKeyDown   = {handleKeyDown}
                        disabled    = {isChatting}
                        placeholder = {
                          activeDocsCount === 0
                            ? 'Upload documents to start chatting…'
                            : 'Ask a question about your documents…'
                        }
                        className   = "flex-1 py-3 px-4 text-sm resize-none bg-transparent outline-none font-sans"
                        style       = {{ color: 'var(--text)', maxHeight: 140 }}
                        id          = "chat-input"
                      />
                    </div>

                    <button
                      type      = "submit"
                      disabled  = {!query.trim() || isChatting}
                      id        = "chat-send-btn"
                      className = "w-10 h-10 flex items-center justify-center rounded-xl transition-all flex-shrink-0"
                      style={{
                        background: query.trim() && !isChatting ? 'var(--accent)' : 'var(--bg-3)',
                        color     : query.trim() && !isChatting ? '#fff' : 'var(--text-4)',
                        cursor    : query.trim() && !isChatting ? 'pointer' : 'default',
                      }}
                    >
                      {isChatting
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Send className="w-4 h-4" />
                      }
                    </button>
                  </form>

                  <p className="text-center text-[10px] mt-2 font-mono" style={{ color: 'var(--text-4)' }}>
                    Press Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </div>

              {/* Citation Drawer */}
              <AnimatePresence>
                {selectedCitation && (
                  <motion.div
                    initial    = {{ opacity: 0, width: 0 }}
                    animate    = {{ opacity: 1, width: 320 }}
                    exit       = {{ opacity: 0, width: 0 }}
                    transition = {{ type: 'spring', stiffness: 280, damping: 28 }}
                    className  = "flex-shrink-0 flex flex-col overflow-hidden"
                    style      = {{ background: 'var(--surface)' }}
                  >
                    {/* Drawer Header */}
                    <div
                      className="h-14 px-4 flex items-center justify-between flex-shrink-0"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          Source
                        </span>
                      </div>
                      <button
                        onClick   = {() => setSelectedCitation(null)}
                        className = "w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                        style     = {{ color: 'var(--text-3)', background: 'var(--bg-2)' }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Drawer Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-4)' }}>
                          File
                        </p>
                        <p className="text-sm font-semibold break-all" style={{ color: 'var(--text)' }}>
                          {selectedCitation.filename}
                        </p>
                      </div>

                      {selectedCitation.page && (
                        <div>
                          <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-4)' }}>
                            Page
                          </p>
                          <span
                            className="text-xs px-2 py-0.5 rounded-lg font-mono"
                            style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                          >
                            Page {selectedCitation.page}
                          </span>
                        </div>
                      )}

                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-4)' }}>
                          Relevance Score
                        </p>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 h-1.5 rounded-full overflow-hidden"
                            style={{ background: 'var(--bg-3)' }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width     : `${Math.min(selectedCitation.score * 100, 100)}%`,
                                background: 'var(--accent)',
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                            {(selectedCitation.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-4)' }}>
                          Matched Chunk
                        </p>
                        <div
                          className="p-3 rounded-xl text-xs leading-relaxed select-text"
                          style={{
                            background: 'var(--bg-2)',
                            border    : '1px solid var(--border)',
                            color     : 'var(--text-2)',
                          }}
                        >
                          {selectedCitation.preview}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              DOCUMENTS VIEW
              ────────────────────────────────────────────────────────────────── */}
          {activeTab === 'documents' && (
            <motion.div
              key        = "documents"
              initial    = {{ opacity: 0, x: 16 }}
              animate    = {{ opacity: 1, x: 0 }}
              exit       = {{ opacity: 0, x: -16 }}
              transition = {{ duration: 0.2 }}
              className  = "flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 max-w-4xl mx-auto w-full"
            >
              {/* Header */}
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <Database className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  Documents
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
                  Upload files to give DocuMind context to answer your questions.
                </p>
              </div>

              {/* Upload Drop Zone */}
              <div
                onDragEnter = {handleDrag}
                onDragOver  = {handleDrag}
                onDragLeave = {handleDrag}
                onDrop      = {handleDrop}
                onClick     = {() => fileInputRef.current?.click()}
                id          = "upload-dropzone"
                className   = "p-10 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all"
                style={{
                  background: dragActive ? 'var(--accent-glow)' : 'var(--surface)',
                  border    : `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border-2)'}`,
                }}
              >
                <input
                  type     = "file"
                  ref      = {fileInputRef}
                  onChange = {e => e.target.files?.[0] && uploadFile(e.target.files[0])}
                  className= "hidden"
                  accept   = ".pdf,.txt,.csv,.xlsx,.docx,.json"
                />

                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                >
                  {uploading
                    ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
                    : <UploadCloud className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                  }
                </div>

                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {uploading ? 'Processing…' : 'Drop a file here, or click to browse'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                  PDF, DOCX, TXT, CSV, XLSX, JSON · Max 15 MB
                </p>

                {uploadError && (
                  <motion.div
                    initial   = {{ opacity: 0 }}
                    animate   = {{ opacity: 1 }}
                    className = "mt-4 px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      border    : '1px solid rgba(239,68,68,0.2)',
                      color     : 'var(--red)',
                    }}
                    onClick   = {e => e.stopPropagation()}
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {uploadError}
                  </motion.div>
                )}

                {uploadSuccess && (
                  <motion.div
                    initial   = {{ opacity: 0 }}
                    animate   = {{ opacity: 1 }}
                    className = "mt-4 px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
                    style={{
                      background: 'var(--green-glow)',
                      border    : '1px solid rgba(16,185,129,0.2)',
                      color     : 'var(--green)',
                    }}
                    onClick   = {e => e.stopPropagation()}
                  >
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {uploadSuccess}
                  </motion.div>
                )}
              </div>

              {/* Document list */}
              <div>
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
                  Uploaded files
                  <span className="ml-2 text-xs font-mono" style={{ color: 'var(--text-4)' }}>
                    ({documents.length})
                  </span>
                </h3>

                {loadingDocs ? (
                  <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'var(--text-3)' }}>
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
                    <span className="text-xs font-mono">Loading…</span>
                  </div>
                ) : documents.length === 0 ? (
                  <div
                    className="rounded-2xl p-12 flex flex-col items-center text-center space-y-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <FileText className="w-8 h-8" style={{ color: 'var(--text-4)' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>
                      No documents uploaded yet
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                      Upload a file above to get started.
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                          {['File', 'Uploaded', 'Status', ''].map(h => (
                            <th
                              key     = {h}
                              className="px-4 py-3 font-semibold font-mono uppercase tracking-wider text-[10px]"
                              style   = {{ color: 'var(--text-3)' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc, idx) => (
                          <tr
                            key       = {doc.id}
                            style={{
                              background  : idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                                <span
                                  className="font-medium truncate max-w-xs"
                                  title    = {doc.filename}
                                  style    = {{ color: 'var(--text)' }}
                                >
                                  {doc.filename}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-3)' }}>
                              {new Date(doc.upload_timestamp).toLocaleDateString()}
                            </td>

                            <td className="px-4 py-3">
                              {doc.status === 'active' && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                  style={{
                                    background: 'var(--green-glow)',
                                    border    : '1px solid rgba(16,185,129,0.25)',
                                    color     : 'var(--green)',
                                  }}
                                >
                                  <span className="w-1 h-1 rounded-full" style={{ background: 'var(--green)' }} />
                                  Ready
                                </span>
                              )}
                              {doc.status === 'processing' && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold animate-pulse"
                                  style={{
                                    background: 'rgba(251,191,36,0.08)',
                                    border    : '1px solid rgba(251,191,36,0.25)',
                                    color     : 'var(--amber)',
                                  }}
                                >
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  Processing
                                </span>
                              )}
                              {doc.status === 'error' && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                  style={{
                                    background: 'rgba(239,68,68,0.08)',
                                    border    : '1px solid rgba(239,68,68,0.25)',
                                    color     : 'var(--red)',
                                  }}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Failed
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              <button
                                onClick   = {() => handleDeleteDocument(doc.id)}
                                id        = {`delete-doc-${doc.id}`}
                                className = "w-7 h-7 flex items-center justify-center rounded-lg transition-all ml-auto"
                                style     = {{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
                                title     = "Delete"
                                onMouseEnter = {e => {
                                  (e.currentTarget as HTMLElement).style.color       = 'var(--red)';
                                  (e.currentTarget as HTMLElement).style.borderColor  = 'rgba(239,68,68,0.3)';
                                }}
                                onMouseLeave = {e => {
                                  (e.currentTarget as HTMLElement).style.color       = 'var(--text-3)';
                                  (e.currentTarget as HTMLElement).style.borderColor  = 'var(--border)';
                                }}
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
