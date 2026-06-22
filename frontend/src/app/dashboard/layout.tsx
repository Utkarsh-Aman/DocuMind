'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router          = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    // ── Auth check: IDENTICAL to original logic ───────────────────────────
    const checkAuth = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

        const token =
          typeof document !== 'undefined'
            ? document.cookie
                .split('; ')
                .find(row => row.startsWith('access_token='))
                ?.split('=')[1]
            : '';

        const res = await fetch(`${backendUrl}/api/auth/me`, {
          method  : 'GET',
          headers : {
            Accept        : 'application/json',
            Authorization : token ? `Bearer ${token}` : '',
          },
          credentials: 'include',
        });

        if (res.ok) {
          const userData = await res.json();
          localStorage.setItem('user', JSON.stringify(userData));
          setAuthenticated(true);
        } else {
          localStorage.removeItem('user');
          document.cookie =
            'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
          window.location.href = '/login';
        }
      } catch (err) {
        console.error('Session verification error:', err);
        localStorage.removeItem('user');
        document.cookie =
          'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: 'var(--bg)' }}
      >
        <motion.div
          animate    = {{ rotate: 360 }}
          transition = {{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className  = "w-9 h-9 rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        />
        <p className="text-xs font-mono tracking-widest uppercase"
           style={{ color: 'var(--text-3)' }}>
          Verifying session…
        </p>
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <AnimatePresence mode="wait">
        <motion.main
          initial    = {{ opacity: 0 }}
          animate    = {{ opacity: 1 }}
          exit       = {{ opacity: 0 }}
          className  = "flex-1 flex"
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
