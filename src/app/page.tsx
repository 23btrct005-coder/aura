"use client";

import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useRouter } from 'next/navigation';
import styles from './page.module.css'; // Just keeping for any future use if needed

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('Successfully signed in as:', result.user.displayName);
      // Once signed in, redirect to the lounge/setup
      router.push('/setup');
    } catch (error: any) {
      console.error('Error signing in:', error.message);
      setIsLoading(false);
    }
  };

  return (
    <main className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      
      {/* Background ambient glow */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(217,70,239,0.05) 50%, rgba(0,0,0,0) 70%)',
        zIndex: -1,
        pointerEvents: 'none'
      }}></div>

      <div className="glass-panel" style={{ padding: '48px', maxWidth: '600px', width: '100%' }}>
        <h1 style={{ fontSize: '4rem', marginBottom: '16px', letterSpacing: '-0.05em' }}>
          <span className="text-gradient">Aura</span>
        </h1>
        
        <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '40px', lineHeight: '1.6' }}>
          Real conversations. Authentic connections. <br/>
          Join the premium audio and video lounge.
        </p>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button 
            className="btn-primary" 
            style={{ padding: '16px 32px', fontSize: '1.1rem', opacity: isLoading ? 0.7 : 1 }}
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            {isLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
        </div>
      </div>
      
    </main>
  );
}
