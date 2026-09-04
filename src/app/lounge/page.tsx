"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, limit } from 'firebase/firestore';

export default function LoungePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [language, setLanguage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/');
        return;
      }
      
      setUser(currentUser);
      
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setLanguage(userDoc.data().languagePreference || '');
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleRandomMatch = async () => {
    if (!user || !language) return;
    setIsMatching(true);

    try {
      const callsRef = collection(db, 'calls');
      
      // 1. Look for an existing waiting call with the same language
      const q = query(callsRef, where('status', '==', 'waiting'), where('language', '==', language), limit(1));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // We found a match! Join as the answerer
        const matchDoc = querySnapshot.docs[0];
        await updateDoc(matchDoc.ref, {
          status: 'connecting',
          answererId: user.uid
        });
        router.push(`/call/${matchDoc.id}?mode=answer`);
      } else {
        // No match found. Create a new call as the offerer
        const newCallDoc = await addDoc(callsRef, {
          status: 'waiting',
          language: language,
          offererId: user.uid,
          createdAt: new Date()
        });
        router.push(`/call/${newCallDoc.id}?mode=offer`);
      }
    } catch (error) {
      console.error("Error finding a match:", error);
      setIsMatching(false);
    }
  };

  if (isLoading) return <div style={{ color: 'white', padding: '2rem' }}>Loading Lounge...</div>;

  return (
    <main className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      
      {/* Background ambient glow */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px',
        height: '800px',
        background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, rgba(217,70,239,0.05) 50%, rgba(0,0,0,0) 70%)',
        zIndex: -1,
        pointerEvents: 'none'
      }}></div>

      <div className="glass-panel" style={{ padding: '48px', maxWidth: '800px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
          <span className="text-gradient">The Lounge</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '1.2rem' }}>
          Welcome back, {user?.displayName}. We're looking for {language ? `${language} speakers` : 'people'} to connect you with.
        </p>

        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
          <button 
            className="btn-primary" 
            style={{ padding: '20px 40px', fontSize: '1.2rem', opacity: isMatching ? 0.7 : 1 }}
            onClick={handleRandomMatch}
            disabled={isMatching}
          >
            {isMatching ? 'Finding Match...' : '🎧 Random Audio Match'}
          </button>
          <button className="btn-primary" style={{ padding: '20px 40px', fontSize: '1.2rem', background: 'var(--color-charcoal)', boxShadow: 'none' }}>
            🌍 View Active Rooms
          </button>
        </div>
      </div>
    </main>
  );
}
