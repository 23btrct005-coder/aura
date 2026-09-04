"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection, addDoc, getDocs } from 'firebase/firestore';

// STUN servers help peers find their public IP addresses
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export default function CallPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const callId = params.id as string;
  const mode = searchParams.get('mode'); // 'offer' or 'answer'
  
  const [user, setUser] = useState<any>(null);
  const [callStatus, setCallStatus] = useState<string>('Initializing WebRTC...');
  const [error, setError] = useState<string | null>(null);
  
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push('/');
      else setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, [router]);

  // Main WebRTC Setup
  useEffect(() => {
    if (!user || !callId) return;
    let unsubscribeCall: any = null;
    let unsubscribeAnswer: any = null;
    let unsubscribeOfferCandidates: any = null;
    let unsubscribeAnswerCandidates: any = null;

    const setupWebRTC = async () => {
      try {
        setCallStatus('Requesting microphone access...');
        // 1. Get local audio
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream;
        }

        // 2. Initialize Peer Connection
        setCallStatus('Setting up connection...');
        const pc = new RTCPeerConnection(servers);
        pcRef.current = pc;

        // Add local tracks to the connection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Listen for remote tracks
        pc.ontrack = (event) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
        };

        const callDocRef = doc(db, 'calls', callId);
        const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
        const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

        if (mode === 'offer') {
          // --- OFFERER LOGIC ---
          setCallStatus('Waiting for someone to join...');
          
          // Save ICE candidates from the offerer
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              await addDoc(offerCandidatesRef, event.candidate.toJSON());
            }
          };

          // Create offer
          const offerDescription = await pc.createOffer();
          await pc.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
          };

          await updateDoc(callDocRef, { offer });

          // Listen for answer
          unsubscribeAnswer = onSnapshot(callDocRef, (snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
              setCallStatus('Connecting...');
              const answerDescription = new RTCSessionDescription(data.answer);
              pc.setRemoteDescription(answerDescription);
            }
            if (data?.status === 'ended') {
              handleRemoteHangup();
            }
          });

          // Listen for remote ICE candidates
          unsubscribeAnswerCandidates = onSnapshot(answerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
              }
            });
          });

        } else if (mode === 'answer') {
          // --- ANSWERER LOGIC ---
          setCallStatus('Match found! Connecting to peer...');

          // Save ICE candidates from the answerer
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              await addDoc(answerCandidatesRef, event.candidate.toJSON());
            }
          };

          const callData = (await getDoc(callDocRef)).data();
          if (!callData || !callData.offer) {
            setError('Call not found or expired.');
            return;
          }

          const offerDescription = callData.offer;
          await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

          const answerDescription = await pc.createAnswer();
          await pc.setLocalDescription(answerDescription);

          const answer = {
            sdp: answerDescription.sdp,
            type: answerDescription.type,
          };

          await updateDoc(callDocRef, { answer });

          // Listen for remote ICE candidates
          unsubscribeOfferCandidates = onSnapshot(offerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
              }
            });
          });
          
          unsubscribeCall = onSnapshot(callDocRef, (snapshot) => {
            if (snapshot.data()?.status === 'ended') {
              handleRemoteHangup();
            }
          });
        }

        // Connection state changes
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setCallStatus('Connected! You can talk now.');
            updateDoc(callDocRef, { status: 'connected' });
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setCallStatus('Connection lost.');
          }
        };

      } catch (err: any) {
        console.error('WebRTC Setup Error:', err);
        setError(err.message || 'Failed to access microphone or connect.');
      }
    };

    setupWebRTC();

    return () => {
      // Cleanup
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (unsubscribeCall) unsubscribeCall();
      if (unsubscribeAnswer) unsubscribeAnswer();
      if (unsubscribeOfferCandidates) unsubscribeOfferCandidates();
      if (unsubscribeAnswerCandidates) unsubscribeAnswerCandidates();
    };
  }, [user, callId, mode]);

  const handleRemoteHangup = () => {
    setCallStatus('The other person ended the call.');
    cleanupAndLeave();
  };

  const endCall = async () => {
    if (callId) {
      await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
    }
    cleanupAndLeave();
  };

  const cleanupAndLeave = () => {
    if (pcRef.current) pcRef.current.close();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setTimeout(() => {
      router.push('/lounge');
    }, 2000);
  };

  if (!user) return <div style={{ padding: '2rem', color: 'white' }}>Loading...</div>;

  return (
    <main className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '48px', maxWidth: '600px', width: '100%', textAlign: 'center' }}>
        
        {/* Pulsing Audio Visualizer Mock */}
        <div style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'var(--gradient-neon)',
          margin: '0 auto 40px auto',
          boxShadow: callStatus.includes('Connected') ? '0 0 40px rgba(139,92,246,0.8)' : '0 0 40px rgba(139,92,246,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: callStatus.includes('Connected') ? 'pulse 1s infinite' : 'pulse 2.5s infinite'
        }}>
          <span style={{ fontSize: '3rem' }}>🎧</span>
        </div>

        <h2 style={{ fontSize: '2rem', marginBottom: '16px' }}>{error ? 'Error' : callStatus}</h2>
        
        {error ? (
          <p style={{ color: 'var(--color-coral)', marginBottom: '40px' }}>{error}</p>
        ) : (
          <p style={{ color: 'var(--text-muted)', marginBottom: '40px' }}>
            {mode === 'offer' ? 'Broadcasting...' : 'Receiving...'}
          </p>
        )}

        <button 
          className="btn-primary" 
          style={{ background: 'var(--color-coral)', boxShadow: 'none' }}
          onClick={endCall}
        >
          End Call & Return
        </button>

        {/* Hidden audio elements for WebRTC */}
        <audio ref={localAudioRef} autoPlay muted playsInline style={{ display: 'none' }} />
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217,70,239, 0.4); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(217,70,239, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217,70,239, 0); }
        }
      `}} />
    </main>
  );
}
