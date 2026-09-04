"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, limit, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, User, Settings, LogOut, Headphones, Video, Activity, Save } from 'lucide-react';

export default function LoungePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [language, setLanguage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(1);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'profile' | 'settings'>('dashboard');

  const [editLanguage, setEditLanguage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/');
        return;
      }
      
      setUser(currentUser);
      
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setLanguage(userDoc.data().languagePreference || '');
          setEditLanguage(userDoc.data().languagePreference || '');
        }
        
        // Mark user as online
        await updateDoc(userRef, { isOnline: true });

        // Handle browser close
        const handleUnload = () => {
          // Note: navigator.sendBeacon is better, but this is a simple prototype approach
          updateDoc(userRef, { isOnline: false }).catch(() => {});
        };
        window.addEventListener('beforeunload', handleUnload);
        
        return () => window.removeEventListener('beforeunload', handleUnload);
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setIsLoading(false);
      }
    });

    // Real-time listener for ONLINE users
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('isOnline', '==', true));
    const unsubscribeUsers = onSnapshot(q, (snapshot) => {
      setOnlineUsers(snapshot.size || 1); // Fallback to 1 (yourself) if latency
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
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

  const handleUpdateProfile = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        languagePreference: editLanguage
      });
      setLanguage(editLanguage);
    } catch (error) {
      console.error("Error updating profile:", error);
    }
    setIsSaving(false);
  };

  const handleSignOut = async () => {
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { isOnline: false });
    }
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
          <div 
            onClick={() => setActiveTab('dashboard')}
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} 
            style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', background: activeTab === 'dashboard' ? 'rgba(255,255,255,0.05)' : 'transparent', color: activeTab === 'dashboard' ? 'white' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <Home size={20} color={activeTab === 'dashboard' ? 'var(--color-purple)' : 'currentColor'} />
            <span style={{ fontWeight: 500 }}>Lounge Dashboard</span>
          </div>
          
          <div 
            onClick={() => setActiveTab('profile')}
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} 
            style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', background: activeTab === 'profile' ? 'rgba(255,255,255,0.05)' : 'transparent', color: activeTab === 'profile' ? 'white' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <User size={20} color={activeTab === 'profile' ? 'var(--color-purple)' : 'currentColor'} />
            <span style={{ fontWeight: 500 }}>My Profile</span>
          </div>

          <div 
            onClick={() => setActiveTab('settings')}
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} 
            style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', background: activeTab === 'settings' ? 'rgba(255,255,255,0.05)' : 'transparent', color: activeTab === 'settings' ? 'white' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <Settings size={20} color={activeTab === 'settings' ? 'var(--color-purple)' : 'currentColor'} />
            <span style={{ fontWeight: 500 }}>Settings</span>
          </div>
        </div>

        <div onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 'auto' }}>
          <LogOut size={20} />
          <span>Sign Out</span>
        </div>
      </nav>

      {/* Main Area */}
      <main style={{ flexGrow: 1, padding: '48px', position: 'relative', overflow: 'hidden' }}>
        
        <div style={{ position: 'absolute', top: 0, right: 0, width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 60%)', filter: 'blur(80px)', pointerEvents: 'none' }}></div>
        
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
                <div>
                  <h2 style={{ fontSize: '2.5rem', marginBottom: '8px', color: 'white' }}>
                    Welcome back, {user?.displayName?.split(' ')[0] || 'User'}
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                    Ready to meet someone new today?
                  </p>
                </div>

                <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px', borderRadius: '100px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981', animation: 'pulse 2s infinite' }}></div>
                  <span style={{ color: 'white', fontWeight: 600 }}>{onlineUsers.toLocaleString()}</span>
                  <span style={{ color: 'var(--text-muted)' }}>online now</span>
                </div>
              </header>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <motion.div whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }} className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(217,70,239,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Video size={32} color="var(--color-magenta)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.5rem', color: 'white', marginBottom: '8px' }}>Video Match</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Face-to-face conversations in full HD with people who speak {language}.</p>
                  </div>
                  <button className="btn-primary" style={{ background: 'var(--gradient-neon)', marginTop: 'auto', padding: '16px', opacity: isMatching ? 0.7 : 1 }} onClick={() => handleRandomMatch('video')} disabled={isMatching}>
                    {isMatching ? 'Finding someone...' : 'Start Video Call'}
                  </button>
                </motion.div>

                <motion.div whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }} className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Headphones size={32} color="var(--color-purple)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.5rem', color: 'white', marginBottom: '8px' }}>Audio Match</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Crystal clear voice chats. Perfect for when you want to just talk.</p>
                  </div>
                  <button className="btn-primary" style={{ background: 'var(--color-charcoal)', border: '1px solid rgba(255,255,255,0.1)', marginTop: 'auto', padding: '16px', opacity: isMatching ? 0.7 : 1 }} onClick={() => handleRandomMatch('audio')} disabled={isMatching}>
                    {isMatching ? 'Finding someone...' : 'Start Audio Call'}
                  </button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '48px', color: 'white' }}>My Profile</h2>
              
              <div className="glass-panel" style={{ padding: '48px', maxWidth: '600px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '48px' }}>
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" style={{ width: '80px', height: '80px', borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--color-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={40} color="white" />
                    </div>
                  )}
                  <div>
                    <h3 style={{ fontSize: '1.5rem', color: 'white', marginBottom: '4px' }}>{user?.displayName}</h3>
                    <p style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                  </div>
                </div>

                <div style={{ marginBottom: '32px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '12px' }}>Primary Language</label>
                  <select 
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '1.1rem' }}
                    value={editLanguage}
                    onChange={(e) => setEditLanguage(e.target.value)}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Tamil">Tamil</option>
                    <option value="Telugu">Telugu</option>
                    <option value="Kannada">Kannada</option>
                    <option value="Malayalam">Malayalam</option>
                    <option value="Bengali">Bengali</option>
                    <option value="Marathi">Marathi</option>
                    <option value="Gujarati">Gujarati</option>
                    <option value="Punjabi">Punjabi</option>
                  </select>
                </div>

                <button 
                  className="btn-primary"
                  onClick={handleUpdateProfile}
                  disabled={isSaving || language === editLanguage}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px 32px', opacity: (isSaving || language === editLanguage) ? 0.5 : 1 }}
                >
                  <Save size={20} />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '48px', color: 'white' }}>Settings</h2>
              
              <div className="glass-panel" style={{ padding: '48px', maxWidth: '600px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '24px' }}>Account Security</h3>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <h4 style={{ color: 'white', marginBottom: '4px' }}>Connected Accounts</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Signed in via Google ({user?.email})</p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0' }}>
                  <div>
                    <h4 style={{ color: 'var(--color-coral)', marginBottom: '4px' }}>Sign Out</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Securely log out of this device.</p>
                  </div>
                  <button onClick={handleSignOut} style={{ padding: '12px 24px', background: 'rgba(244,63,94,0.1)', color: 'var(--color-coral)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '8px', cursor: 'pointer' }}>
                    Log Out
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
