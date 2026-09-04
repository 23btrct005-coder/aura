"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, collection, addDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, Users } from 'lucide-react';

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
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
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
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
        setCallStatus(`Requesting ${isVideo ? 'camera and ' : ''}microphone access...`);
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setCallStatus('Setting up connection...');
        const pc = new RTCPeerConnection(servers);
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        const callDocRef = doc(db, 'calls', callId);
        const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
        const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

        if (mode === 'offer') {
          setCallStatus('Waiting for someone to join...');
          
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              await addDoc(offerCandidatesRef, event.candidate.toJSON());
            }
          };

          const offerDescription = await pc.createOffer();
          await pc.setLocalDescription(offerDescription);

          await updateDoc(callDocRef, { offer: { sdp: offerDescription.sdp, type: offerDescription.type } });

          unsubscribeAnswer = onSnapshot(callDocRef, (snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
              setCallStatus('Connecting...');
              pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
            if (data?.status === 'ended') handleRemoteHangup();
          });

          unsubscribeAnswerCandidates = onSnapshot(answerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            });
          });

        } else if (mode === 'answer') {
          setCallStatus('Match found! Connecting to peer...');

          pc.onicecandidate = async (event) => {
            if (event.candidate) await addDoc(answerCandidatesRef, event.candidate.toJSON());
          };

          const callData = (await getDoc(callDocRef)).data();
          if (!callData || !callData.offer) {
            setError('Call not found or expired.');
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
          const answerDescription = await pc.createAnswer();
          await pc.setLocalDescription(answerDescription);
          await updateDoc(callDocRef, { answer: { sdp: answerDescription.sdp, type: answerDescription.type } });

          unsubscribeOfferCandidates = onSnapshot(offerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            });
          });
          
          unsubscribeCall = onSnapshot(callDocRef, (snapshot) => {
            if (snapshot.data()?.status === 'ended') handleRemoteHangup();
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

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      });
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current && isVideo) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsVideoOff(!track.enabled);
      });
    }
  };

  const handleRemoteHangup = () => {
    setCallStatus('The other person ended the call.');
    cleanupAndLeave(true);
  };

  const endCall = async () => {
    if (callId) await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
    cleanupAndLeave(true);
  };

  const cleanupAndLeave = (redirect: boolean) => {
    if (pcRef.current) pcRef.current.close();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    if (redirect) setTimeout(() => router.push('/lounge'), 2000);
  };

  if (!user) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}></div>;

  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#000' }}>
      
      {/* Remote Video or Audio Status */}
      <AnimatePresence>
        {isVideo ? (
          <motion.video 
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: callStatus.includes('Connected') ? 1 : 0.3, scale: 1 }}
            transition={{ duration: 1 }}
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, zIndex: 1 }} 
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <motion.div 
              animate={{ 
                scale: callStatus.includes('Connected') ? [1, 1.05, 1] : 1,
                boxShadow: callStatus.includes('Connected') ? ['0 0 0 0 rgba(217,70,239, 0.4)', '0 0 0 20px rgba(217,70,239, 0)', '0 0 0 0 rgba(217,70,239, 0)'] : 'none'
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--gradient-neon)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Users size={48} color="white" />
            </motion.div>
            <audio ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />
          </div>
        )}
      </AnimatePresence>

      {/* Local Video (PiP) */}
      {isVideo && (
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring' }}
          style={{
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
          }}
        >
          {isVideoOff ? (
            <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <VideoOff color="var(--text-muted)" size={32} />
            </div>
          ) : (
            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          )}
        </motion.div>
      )}

      {/* Overlay UI & Floating Controls */}
      <motion.div 
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: 'spring' }}
        style={{
          position: 'absolute',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}
      >
        <div style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', padding: '8px 24px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ color: 'white', fontWeight: 500 }}>{error ? 'Error' : callStatus}</span>
        </div>
        
        {error && <p style={{ color: 'var(--color-coral)' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '16px' }}>
          <button onClick={toggleMute} style={{ width: '56px', height: '56px', borderRadius: '50%', background: isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: 'all 0.2s' }}>
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          
          {isVideo && (
            <button onClick={toggleVideo} style={{ width: '56px', height: '56px', borderRadius: '50%', background: isVideoOff ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: 'all 0.2s' }}>
              {isVideoOff ? <VideoOff size={24} /> : <VideoIcon size={24} />}
            </button>
          )}

          <button onClick={endCall} style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', boxShadow: '0 0 20px rgba(244,63,94,0.4)', transition: 'all 0.2s' }}>
            <PhoneOff size={24} />
          </button>
        </div>
      </motion.div>
    </main>
  );
}
