"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, googleProvider } from '../lib/firebase';
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { motion } from 'framer-motion';
import { Sparkles, Users, Video } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/setup');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      router.push('/setup');
    } catch (error: any) {
      console.error('Error signing in:', error.message);
      setIsLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      
      {/* Dynamic Background Glows */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)', filter: 'blur(80px)', zIndex: -1 }}></div>
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(244,63,94,0.15) 0%, transparent 70%)', filter: 'blur(80px)', zIndex: -1 }}></div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="glass-panel" 
        style={{ padding: '64px', maxWidth: '600px', width: '90%', textAlign: 'center', position: 'relative' }}
      >
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '24px', background: 'var(--gradient-neon)', marginBottom: '32px', boxShadow: '0 10px 30px rgba(217,70,239,0.3)' }}
        >
          <Sparkles color="white" size={40} />
        </motion.div>

        <h1 style={{ fontSize: '4rem', marginBottom: '16px', letterSpacing: '-0.02em' }}>
          <span className="text-gradient">Aura</span>
        </h1>
        
        <p style={{ color: 'var(--text-muted)', marginBottom: '48px', fontSize: '1.25rem', lineHeight: '1.6' }}>
          Real conversations. Authentic connections.<br/>
          Join the premium audio and video lounge.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginBottom: '48px', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Users size={24} color="var(--color-purple)" />
            <span style={{ fontSize: '0.9rem' }}>Match Instantly</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Video size={24} color="var(--color-coral)" />
            <span style={{ fontSize: '0.9rem' }}>HD Video</span>
          </div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(217,70,239,0.5)" }}
          whileTap={{ scale: 0.95 }}
          className="btn-primary" 
          style={{ width: '100%', padding: '20px', fontSize: '1.2rem', opacity: isLoading ? 0.7 : 1 }}
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? 'Connecting...' : 'Continue with Google'}
        </motion.button>
      </motion.div>
    </main>
  );
}
