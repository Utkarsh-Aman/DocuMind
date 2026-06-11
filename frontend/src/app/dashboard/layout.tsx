'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const res = await fetch(`${backendUrl}/api/auth/me`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          credentials: 'include', // Send the HttpOnly cookie
        });

        if (res.ok) {
          const userData = await res.json();
          // Keep a client-side copy of user data
          localStorage.setItem('user', JSON.stringify(userData));
          setAuthenticated(true);
        } else {
          // Cookie expired or invalid
          localStorage.removeItem('user');
          router.replace('/login');
        }
      } catch (err) {
        console.error('Session verification error:', err);
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center font-mono">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-2 border-green-500 border-t-transparent rounded-full mb-4 shadow-[0_0_15px_rgba(34,197,94,0.2)]"
        ></motion.div>
        <div className="text-xs text-green-500 uppercase tracking-widest animate-pulse">
          Establishing Secure Session...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-black text-zinc-300 font-sans flex flex-col">
      <AnimatePresence mode="wait">
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 flex"
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
