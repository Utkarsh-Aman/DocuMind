'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="h-screen w-screen bg-black flex items-center justify-center font-mono">
      <div className="text-green-500 animate-pulse uppercase tracking-widest text-sm">
        Initializing secure connection...
      </div>
    </div>
  );
}
