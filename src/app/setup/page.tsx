"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export default function SetupPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('Hindi');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/');
      } else {
        setUser(currentUser);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleEnterLounge = async () => {
    if (!user) return;
    setIsSaving(true);
    
    try {
      // Save the selected language to Firestore
      await setDoc(doc(db, 'users', user.uid), {
        displayName: user.displayName,
        email: user.email,
        languagePreference: selectedLanguage,
        updatedAt: new Date()
      }, { merge: true });

      // Navigate to the lounge
      router.push('/lounge');
    } catch (error) {
      console.error("Error saving profile:", error);
      setIsSaving(false);
    }
  };

  if (!user) return <div style={{ color: 'white', padding: '2rem' }}>Loading...</div>;

  return (
    <main className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '48px', maxWidth: '600px', width: '100%' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '16px' }}>Welcome, {user.displayName}!</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
          Before we drop you into the Lounge, let's set up your profile so we can match you perfectly.
        </p>

        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Primary Spoken Language</label>
          <select 
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '16px', 
              borderRadius: '12px', 
              background: 'var(--color-charcoal)', 
              border: '1px solid var(--glass-border)', 
              color: 'white',
              fontSize: '1.1rem',
              outline: 'none'
            }}
          >
            <option value="Hindi">Hindi</option>
            <option value="Tamil">Tamil</option>
            <option value="Telugu">Telugu</option>
            <option value="Kannada">Kannada</option>
            <option value="Malayalam">Malayalam</option>
            <option value="Bengali">Bengali</option>
            <option value="Marathi">Marathi</option>
            <option value="Gujarati">Gujarati</option>
            <option value="Punjabi">Punjabi</option>
            <option value="English">English</option>
          </select>
        </div>

        <button 
          className="btn-primary" 
          style={{ width: '100%', padding: '16px', fontSize: '1.1rem', opacity: isSaving ? 0.7 : 1 }}
          onClick={handleEnterLounge}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Enter the Lounge'}
        </button>
      </div>
    </main>
  );
}
