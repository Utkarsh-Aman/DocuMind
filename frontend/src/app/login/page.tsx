'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BrainCircuit, AlertCircle, Moon, Sun } from 'lucide-react';

// ─── Theme Toggle Hook ────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
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

// ─── Login Page ───────────────────────────────────────────────────────────────
export default function Login() {
  const router  = useRouter();
  const { dark, toggle } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    // ── 1. Define the Google credential handler (UNCHANGED) ──────────────────
    const handleCredentialResponse = async (response: any) => {
      setLoading(true);
      setError(null);
      try {
        const idToken    = response.credential;
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

        const res = await fetch(`${backendUrl}/api/auth/google`, {
          method      : 'POST',
          headers     : { 'Content-Type': 'application/json' },
          body        : JSON.stringify({ id_token: idToken }),
          credentials : 'include',
        });

        const data = await res.json();

        if (res.ok) {
          // Store non-sensitive UI state
          localStorage.setItem('user', JSON.stringify(data.user));
          // Write access token to client-side cookie so middleware can read it
          document.cookie = `access_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
          // Hard navigation to bypass Next.js Router Cache
          window.location.href = '/dashboard';
        } else {
          setError(data.detail || 'Authentication failed. Please try again.');
        }
      } catch (err: any) {
        setError('Unable to connect to the authentication server.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    // ── 2. Inject Google 3P SDK (UNCHANGED) ─────────────────────────────────
    const initializeGoogleSignIn = () => {
      if ((window as any).google) {
        (window as any).google.accounts.id.initialize({
          client_id : '1034948744999-0a29fr7khu9e08luec1mbrng63uslq60.apps.googleusercontent.com',
          callback  : handleCredentialResponse,
          context   : 'signin',
          ux_mode   : 'popup',
        });

        (window as any).google.accounts.id.renderButton(
          document.getElementById('google-signin-btn'),
          {
            theme          : dark ? 'filled_black' : 'outline',
            size           : 'large',
            width          : 300,
            text           : 'signin_with',
            shape          : 'pill',
            logo_alignment : 'left',
          }
        );
      }
    };

    if ((window as any).google) {
      initializeGoogleSignIn();
    } else {
      const script      = document.createElement('script');
      script.src        = 'https://accounts.google.com/gsi/client';
      script.async      = true;
      script.defer      = true;
      script.onload     = initializeGoogleSignIn;
      document.body.appendChild(script);
    }
  }, [router, dark]);

  return (
    <div className="min-h-screen w-full mesh-bg flex items-center justify-center relative overflow-hidden"
         style={{ background: 'var(--bg)' }}>

      {/* Theme toggle — top right */}
      <button
        onClick={toggle}
        id="theme-toggle-login"
        className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full transition-all"
        style={{
          background   : 'var(--surface)',
          border       : '1px solid var(--border)',
          color        : 'var(--text-3)',
        }}
        title="Toggle theme"
      >
        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* Card */}
      <motion.div
        initial    = {{ opacity: 0, y: 24 }}
        animate    = {{ opacity: 1, y: 0 }}
        transition = {{ duration: 0.6, ease: 'easeOut' }}
        className  = "w-full max-w-sm mx-4 rounded-2xl p-8 relative z-10"
        style={{
          background : 'var(--surface)',
          border     : '1px solid var(--border)',
          boxShadow  : '0 24px 64px rgba(0,0,0,0.15)',
        }}
      >

        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <motion.div
            initial    = {{ scale: 0.7, opacity: 0 }}
            animate    = {{ scale: 1, opacity: 1 }}
            transition = {{ delay: 0.15, type: 'spring', stiffness: 200 }}
            className  = "w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background : 'var(--accent-glow)',
              border     : '1px solid var(--border)',
            }}
          >
            <BrainCircuit className="w-7 h-7" style={{ color: 'var(--accent)' }} />
          </motion.div>

          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Docu<span style={{ color: 'var(--accent)' }}>Mind</span>
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-3)' }}>
            Your private AI document assistant.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <motion.div
            initial   = {{ opacity: 0, y: -8 }}
            animate   = {{ opacity: 1, y: 0 }}
            className = "mb-5 p-3.5 rounded-xl flex items-start gap-2.5 text-sm"
            style={{
              background : 'rgba(239,68,68,0.08)',
              border     : '1px solid rgba(239,68,68,0.2)',
              color      : 'var(--red)',
            }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-4)' }}>Sign in to continue</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Google Sign-in Button */}
        <div className="flex justify-center relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 rounded-full"
                 style={{ background: 'var(--surface)' }}>
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                   style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          )}
          <div id="google-signin-btn" className="transition-transform hover:scale-[1.02]" />
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6 font-mono" style={{ color: 'var(--text-4)' }}>
          Documents are isolated per account. No data is shared.
        </p>
      </motion.div>
    </div>
  );
}
