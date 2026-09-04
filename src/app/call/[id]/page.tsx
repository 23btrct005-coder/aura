"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection, addDoc } from 'firebase/firestore';

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
  const mode = searchParams.get('mode'); 
  const callType = searchParams.get('type') || 'audio'; 
  const isVideo = callType === 'video';
  
  const [user, setUser] = useState<any>(null);
  const [callStatus, setCallStatus] = useState<string>('Initializing WebRTC...');
  const [error, setError] = useState<string | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push('/');
      else setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!user || !callId) return;
    let unsubscribeCall: any = null;
    let unsubscribeAnswer: any = null;
    let unsubscribeOfferCandidates: any = null;
    let unsubscribeAnswerCandidates: any = null;

    const setupWebRTC = async () => {
      try {
        setCallStatus(\`Requesting \${isVideo ? 'camera and ' : ''}microphone access...\`);
        
        // 1. Get local media stream (audio only, or audio+video)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // 2. Initialize Peer Connection
        setCallStatus('Setting up connection...');
        const pc = new RTCPeerConnection(servers);
        pcRef.current = pc;

        // Add local tracks to the connection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Listen for remote tracks
        pc.ontrack = (event) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        const callDocRef = doc(db, 'calls', callId);
        const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
        const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

        if (mode === 'offer') {
          // --- OFFERER LOGIC ---
          setCallStatus('Waiting for someone to join...');
          
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              await addDoc(offerCandidatesRef, event.candidate.toJSON());
            }
          };

          const offerDescription = await pc.createOffer();
          await pc.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
          };

          await updateDoc(callDocRef, { offer });

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

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setCallStatus('Connected!');
            updateDoc(callDocRef, { status: 'connected' });
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setCallStatus('Connection lost.');
          }
        };

      } catch (err: any) {
        console.error('WebRTC Setup Error:', err);
        setError(err.message || 'Failed to access camera/microphone or connect.');
      }
    };

    setupWebRTC();

    return () => {
      cleanupAndLeave(false);
      if (unsubscribeCall) unsubscribeCall();
      if (unsubscribeAnswer) unsubscribeAnswer();
      if (unsubscribeOfferCandidates) unsubscribeOfferCandidates();
      if (unsubscribeAnswerCandidates) unsubscribeAnswerCandidates();
    };
  }, [user, callId, mode, isVideo]);

  const handleRemoteHangup = () => {
    setCallStatus('The other person ended the call.');
    cleanupAndLeave(true);
  };

  const endCall = async () => {
    if (callId) {
      await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
    }
    cleanupAndLeave(true);
  };

  const cleanupAndLeave = (redirect: boolean) => {
    if (pcRef.current) pcRef.current.close();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (redirect) {
      setTimeout(() => {
        router.push('/lounge');
      }, 2000);
    }
  };

  if (!user) return <div style={{ padding: '2rem', color: 'white' }}>Loading...</div>;

  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#000' }}>
      
      {/* Remote Video (Fullscreen Background) or Audio pulsing UI */}
      {isVideo ? (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 1,
            opacity: callStatus.includes('Connected') ? 1 : 0.2,
            transition: 'opacity 1s ease'
          }} 
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
           <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'var(--gradient-neon)',
            boxShadow: callStatus.includes('Connected') ? '0 0 40px rgba(139,92,246,0.8)' : '0 0 40px rgba(139,92,246,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: callStatus.includes('Connected') ? 'pulse 1s infinite' : 'pulse 2.5s infinite'
          }}>
            <span style={{ fontSize: '3rem' }}>🎧</span>
          </div>
          <audio ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />
        </div>
      )}

      {/* Local Video (Picture-in-Picture) */}
      {isVideo ? (
        <div style={{
          position: 'absolute',
          bottom: '120px',
          right: '32px',
          width: '150px',
          height: '220px',
          borderRadius: '16px',
          overflow: 'hidden',
          zIndex: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          border: '2px solid rgba(255,255,255,0.2)'
        }}>
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
          />
        </div>
      ) : (
        <audio ref={localVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
      )}

      {/* Overlay UI (Status & Controls) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '32px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'white', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          {error ? 'Error' : callStatus}
        </h2>
        
        {error && <p style={{ color: 'var(--color-coral)', marginBottom: '16px' }}>{error}</p>}

        <button 
          className="btn-primary" 
          style={{ background: 'var(--color-coral)', boxShadow: '0 0 20px rgba(244,63,94,0.4)' }}
          onClick={endCall}
        >
          End Call
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: \`
        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217,70,239, 0.4); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(217,70,239, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217,70,239, 0); }
        }
      \`}} />
    </main>
  );
}
