'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, Sparkles, AlertCircle } from 'lucide-react';

export default function Login() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Define the Google credential handler
    const handleCredentialResponse = async (response: any) => {
      setLoading(true);
      setError(null);
      try {
        const idToken = response.credential;
        
        // 2. Call the FastAPI backend Google login endpoint
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const res = await fetch(`${backendUrl}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id_token: idToken }),
        });

        const data = await res.json();
        
        if (res.ok) {
          // Store user info in localStorage for non-sensitive UI state representation
          localStorage.setItem('user', JSON.stringify(data.user));
          
          // Successful login, cookie is set by backend, redirect to dashboard
          router.push('/dashboard');
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

    // 3. Dynamically inject the Google 3P SDK Script
    const initializeGoogleSignIn = () => {
      if ((window as any).google) {
        (window as any).google.accounts.id.initialize({
          client_id: '1034948744999-0a29fr7khu9e08luec1mbrng63uslq60.apps.googleusercontent.com',
          callback: handleCredentialResponse,
          context: 'signin',
          ux_mode: 'popup',
        });

        (window as any).google.accounts.id.renderButton(
          document.getElementById('google-signin-btn'),
          {
            theme: 'filled_black',
            size: 'large',
            width: 320,
            text: 'signin_with',
            shape: 'pill',
            logo_alignment: 'left',
          }
        );
      }
    };

    if ((window as any).google) {
      initializeGoogleSignIn();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleSignIn;
      document.body.appendChild(script);
    }
  }, [router]);

  return (
    <div className="min-h-screen w-full bg-black relative flex items-center justify-center overflow-hidden font-sans selection:bg-neutral-800">
      {/* Decorative Glowing Orbs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-green-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Cybernetic Dot Matrix grid overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="w-full max-w-md p-8 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-xl shadow-2xl relative z-10"
      >
        {/* Header Section */}
        <div className="flex flex-col items-center text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-14 h-14 rounded-xl bg-green-950/50 border border-green-500/40 flex items-center justify-center text-green-400 mb-4 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
          >
            <Shield className="w-8 h-8" />
          </motion.div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2 font-mono flex items-center gap-1.5 justify-center">
            Docu<span className="text-green-400">Mind</span>
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-ping"></span>
          </h1>
          <p className="text-zinc-400 text-sm max-w-xs mt-1">
            Enterprise document search with zero-knowledge metadata security.
          </p>
        </div>

        {/* Warning/Error Banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-red-300 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Action Button Section */}
        <div className="flex flex-col items-center justify-center space-y-4 py-4 border-t border-b border-zinc-800/50">
          <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-mono">
            Secure Entry Portal
          </p>

          <div className="relative">
            {loading && (
              <div className="absolute inset-0 bg-zinc-950/80 rounded-full flex items-center justify-center z-10">
                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            <div id="google-signin-btn" className="shadow-lg transition-transform hover:scale-[1.02]"></div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center flex flex-col items-center space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
            <Sparkles className="w-3.5 h-3.5 text-green-500" />
            <span>Isolated Environment Enabled</span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">
            DocuMind security v2.1.0 // TLS 1.3
          </span>
        </div>
      </motion.div>
    </div>
  );
}
