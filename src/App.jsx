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

  const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  };

  const joinRoom = async () => {
    localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideoRef.current.srcObject = localStream.current;

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
    <div>
      {!joined && (
        <button onClick={joinRoom}>Присоединиться к комнате</button>
      )}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <video ref={localVideoRef} autoPlay muted />
        {remoteStreams.map((stream, index) => (
          <video
            key={stream.id}
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
    </div>
  );
}

export default App;

