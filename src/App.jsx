import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// const socket = io('http://localhost:5000'); // 🔁 Сервер сигналинга
const socket = io('https://innate-sixth-flamingo.glitch.me'); // 🔁 Сервер сигналинга

function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('room1');
  const localVideoRef = useRef(null);
  const localStream = useRef(null);
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);

  const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  };

  const toggleMicrophone = () => {
    const audioTrack = localStream.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicEnabled(audioTrack.enabled);
    }
  };

  const toggleCamera = () => {
    const videoTrack = localStream.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamEnabled(videoTrack.enabled);
    }
  };

  const joinRoom = async () => {
    try {
      // localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }, });

      // Отключаем доступ по умолчанию
      localStream.current.getAudioTracks().forEach(track => (track.enabled = false));
      localStream.current.getVideoTracks().forEach(track => (track.enabled = false));

      localVideoRef.current.srcObject = localStream.current;
      console.log('localStream.current ==>', localStream.current)
    } catch (error) {
      console.log('no audio or video controller', error)
    }

    socket.emit('join', roomId);
    setJoined(true);
  };

  const createPeer = (peerId, initiator) => {
    const pc = new RTCPeerConnection(servers);

    localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { roomId, candidate: e.candidate, to: peerId });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStreams(prev => {
        const exists = prev.find(stream => stream.id === e.streams[0].id);
        if (exists) return prev;
        return [...prev, e.streams[0]];
      });
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { roomId, offer, to: peerId });
      };
    }

    peersRef.current[peerId] = pc;
  };

  useEffect(() => {
    socket.on('all-users', (users) => {
      users.forEach(userId => {
        createPeer(userId, true);
      });
    });

    socket.on('user-joined', (userId) => {
      createPeer(userId, false);
    });

    socket.on('offer', async ({ from, offer }) => {
      const pc = peersRef.current[from];
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { roomId, answer, to: from });
    });

    socket.on('answer', async ({ from, answer }) => {
      const pc = peersRef.current[from];
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('ice-candidate', ({ from, candidate }) => {
      const pc = peersRef.current[from];
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('user-disconnected', (userId) => {
      if (peersRef.current[userId]) {
        peersRef.current[userId].close();
        delete peersRef.current[userId];
        setRemoteStreams(prev => prev.filter(stream => stream.id !== userId));
      }
    });
  }, [roomId]);

  return (
    <div className='app'>
      {!joined && (
        <button onClick={joinRoom}>Присоединиться к комнате</button>
      )}
      <div className="grid">
        <video ref={localVideoRef} autoPlay muted />
        {remoteStreams.map((stream, index) => (
          <video
            key={index}
            autoPlay
            playsInline
            ref={video => {
              if (video && video.srcObject !== stream) {
                video.srcObject = stream;
              }
            }}
          />
        ))}
      </div>
      <br />
      <button onClick={toggleMicrophone}>{micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}</button>
      <button onClick={toggleCamera}> {camEnabled ? 'Выключить камеру' : 'Включить камеру'}</button>
    </div>
  );
}

export default App;

