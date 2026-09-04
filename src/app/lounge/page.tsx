"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, limit } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { Home, User, Settings, LogOut, Headphones, Video, Users, Globe2, Activity } from 'lucide-react';

export default function LoungePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [language, setLanguage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);
  const [activeUsersMock, setActiveUsersMock] = useState(1248);

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

    // Mock active users fluctuating
    const interval = setInterval(() => {
      setActiveUsersMock(prev => prev + Math.floor(Math.random() * 5) - 2);
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [router]);

  const handleRandomMatch = async (callType: 'audio' | 'video') => {
    if (!user || !language) return;
    setIsMatching(true);

    try {
      const callsRef = collection(db, 'calls');
      const q = query(
        callsRef, 
        where('status', '==', 'waiting'), 
        where('language', '==', language),
        where('type', '==', callType),
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const matchDoc = querySnapshot.docs[0];
        await updateDoc(matchDoc.ref, {
          status: 'connecting',
          answererId: user.uid
        });
        router.push(`/call/${matchDoc.id}?mode=answer&type=${callType}`);
      } else {
        const newCallDoc = await addDoc(callsRef, {
          status: 'waiting',
          language: language,
          type: callType,
          offererId: user.uid,
          createdAt: new Date()
        });
        router.push(`/call/${newCallDoc.id}?mode=offer&type=${callType}`);
      }
    } catch (error) {
      console.error("Error finding a match:", error);
      setIsMatching(false);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  if (isLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
        <Activity size={40} color="var(--color-purple)" />
      </motion.div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0f0f11' }}>
      
      {/* Sidebar Navigation */}
      <nav style={{ width: '280px', borderRight: '1px solid var(--glass-border)', padding: '32px 24px', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '48px', paddingLeft: '12px' }}>
          <span className="text-gradient">Aura</span>
        </h1>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
          <div className="nav-item active" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer' }}>
            <Home size={20} color="var(--color-purple)" />
            <span style={{ fontWeight: 500 }}>Lounge Dashboard</span>
          </div>
          <div className="nav-item" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <User size={20} />
            <span>My Profile</span>
          </div>
          <div className="nav-item" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <Settings size={20} />
            <span>Settings</span>
          </div>
        </div>

        <div onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 'auto' }}>
          <LogOut size={20} />
          <span>Sign Out</span>
        </div>
      </nav>

      {/* Main Dashboard Area */}
      <main style={{ flexGrow: 1, padding: '48px', position: 'relative', overflow: 'hidden' }}>
        
        {/* Ambient Glow */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 60%)', filter: 'blur(80px)', pointerEvents: 'none' }}></div>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
          <div>
            <motion.h2 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} style={{ fontSize: '2.5rem', marginBottom: '8px', color: 'white' }}>
              Welcome back, {user?.displayName?.split(' ')[0]}
            </motion.h2>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
              Ready to meet someone new today?
            </motion.p>
          </div>

          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px', borderRadius: '100px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981', animation: 'pulse 2s infinite' }}></div>
            <span style={{ color: 'white', fontWeight: 600 }}>{activeUsersMock.toLocaleString()}</span>
            <span style={{ color: 'var(--text-muted)' }}>online now</span>
          </div>
        </header>

        {/* Action Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          
          <motion.div 
            whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
            className="glass-panel" 
            style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', overflow: 'hidden' }}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(217,70,239,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Video size={32} color="var(--color-magenta)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.5rem', color: 'white', marginBottom: '8px' }}>Video Match</h3>
              <p style={{ color: 'var(--text-muted)' }}>Face-to-face conversations in full HD with people who speak {language}.</p>
            </div>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary" 
              style={{ background: 'var(--gradient-neon)', marginTop: 'auto', padding: '16px', opacity: isMatching ? 0.7 : 1 }}
              onClick={() => handleRandomMatch('video')}
              disabled={isMatching}
            >
              {isMatching ? 'Finding someone...' : 'Start Video Call'}
            </motion.button>
          </motion.div>

          <motion.div 
            whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
            className="glass-panel" 
            style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Headphones size={32} color="var(--color-purple)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.5rem', color: 'white', marginBottom: '8px' }}>Audio Match</h3>
              <p style={{ color: 'var(--text-muted)' }}>Crystal clear voice chats. Perfect for when you want to just talk.</p>
            </div>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary" 
              style={{ background: 'var(--color-charcoal)', border: '1px solid rgba(255,255,255,0.1)', marginTop: 'auto', padding: '16px', opacity: isMatching ? 0.7 : 1 }}
              onClick={() => handleRandomMatch('audio')}
              disabled={isMatching}
            >
              {isMatching ? 'Finding someone...' : 'Start Audio Call'}
            </motion.button>
          </motion.div>

        </div>

      </main>
    </div>
  );
}
