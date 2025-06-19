import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

// const socket = io('http://localhost:5000'); // 🔁 Сервер сигналинга
const socket = io("https://innate-sixth-flamingo.glitch.me"); // 🔁 Сервер сигналинга
const stunServer = "stun:stun.l.google.com:19302"

export default function Connect() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("room1");
  const localVideoRef = useRef(null);
  const localStream = useRef(null);
  const screenTrackRef = useRef(null);
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);

  const servers = {
    iceServers: [{ urls: stunServer }],
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

  const toggleScreenShare = async () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      const videoTrack = localStream.current.getVideoTracks()[0];
      for (const peerId in peersRef.current) {
        const sender = peersRef.current[peerId].getSenders().find(s => s.track.kind === 'video');
        if (sender && videoTrack) sender.replaceTrack(videoTrack);
      }
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;
      for (const peerId in peersRef.current) {
        const sender = peersRef.current[peerId].getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      }
      screenTrack.onended = () => toggleScreenShare();
    }
  };

  const joinRoom = async () => {
    try {
      // localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = await navigator.mediaDevices.getUserMedia({
        // video: true,
        video: {
          aspectRatio: 16 / 9
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Отключаем доступ по умолчанию
      localStream.current
        .getAudioTracks()
        .forEach((track) => (track.enabled = false));
      localStream.current
        .getVideoTracks()
        .forEach((track) => (track.enabled = false));

      localVideoRef.current.srcObject = localStream.current;
      console.log("localStream.current ==>", localStream.current);
    } catch (error) {
      console.log("no audio or video controller", error);
    }

    socket.emit("join", roomId);
    setJoined(true);
  };

  const goFullscreen = (videoElement) => {
    if (videoElement.requestFullscreen) {
      videoElement.requestFullscreen();
    } else if (videoElement.webkitRequestFullscreen) {
      videoElement.webkitRequestFullscreen();
    } else if (videoElement.msRequestFullscreen) {
      videoElement.msRequestFullscreen();
    }
  };

  const createPeer = (peerId, initiator) => {
    const pc = new RTCPeerConnection(servers);

    // localStream.current
    //   .getTracks()
    //   .forEach((track) => pc.addTrack(track, localStream.current));

    const videoTrack = screenTrackRef.current || localStream.current.getVideoTracks()[0];
    const audioTrack = localStream.current.getAudioTracks()[0];

    if (videoTrack) pc.addTrack(videoTrack, localStream.current);
    if (audioTrack) pc.addTrack(audioTrack, localStream.current);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", {
          roomId,
          candidate: e.candidate,
          to: peerId,
        });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStreams(prev => {
        const exists = prev.find(entry => entry.userId === peerId);
        if (exists) return prev;
        return [...prev, { userId: peerId, stream: e.streams[0] }];
      });
    };


    if (initiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { roomId, offer, to: peerId });
      };
    }

    peersRef.current[peerId] = pc;
  };

  useEffect(() => {
    socket.on("all-users", (users) => {
      users.forEach((userId) => {
        createPeer(userId, true);
      });
    });

    socket.on("user-joined", (userId) => {
      createPeer(userId, false);
    });

    socket.on("offer", async ({ from, offer }) => {
      const pc = peersRef.current[from];
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { roomId, answer, to: from });
    });

    socket.on("answer", async ({ from, answer }) => {
      const pc = peersRef.current[from];
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", ({ from, candidate }) => {
      const pc = peersRef.current[from];
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("user-disconnected", (userId) => {
      if (peersRef.current[userId]) {
        peersRef.current[userId].close();
        delete peersRef.current[userId];
        setRemoteStreams(prev => prev.filter(entry => entry.userId !== userId));
      }
    });
  }, [roomId]);

  return (
    <div className="connect">
      {!joined && <button onClick={joinRoom}>Присоединиться к комнате</button>}
      <div className="grid">
        <video ref={localVideoRef} autoPlay muted />
        {remoteStreams.map(({ userId, stream }, index) => (
          <div
            key={userId}
            onClick={(e) => {
              const video = e.currentTarget.previousSibling;
              if (video) goFullscreen(video);
            }}
          >
            <video
              autoPlay
              playsInline
              ref={video => {
                if (video && video.srcObject !== stream) {
                  video.srcObject = stream;
                }
              }}
            />
            {/* <button
              onClick={(e) => {
                const video = e.currentTarget.previousSibling;
                if (video) goFullscreen(video);
              }}
              className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-sm px-2 py-1 rounded"
            >
              ⛶
            </button> */}
          </div>
        ))}
        {/* {remoteStreams.map((stream, index) => (
          <video
            key={index}
            autoPlay
            playsInline
            ref={(video) => {
              if (video && video.srcObject !== stream) {
                video.srcObject = stream;
              }
            }}
          />
        ))} */}
      </div>
      {joined && <div className="controls">
        <button onClick={toggleMicrophone}>
          {micEnabled ? 
            <svg className="mic" viewBox="0 0 16 16" >
              <path fillRule="evenodd" d="M8 0c-.78 0-1.538.29-2.104.821A2.797 2.797 0 005 2.861V8.14c0 .775.328 1.507.896 2.04.566.53 1.323.821 2.104.821.78 0 1.538-.29 2.104-.821A2.797 2.797 0 0011 8.139V2.86c0-.775-.329-1.507-.896-2.04A3.077 3.077 0 008 0zM6.922 1.915A1.578 1.578 0 018 1.5c.413 0 .8.154 1.078.415.276.26.422.601.422.946V8.14c0 .345-.146.686-.422.946A1.578 1.578 0 018 9.5c-.413 0-.8-.154-1.078-.415-.276-.26-.422-.601-.422-.946V2.86c0-.345.146-.686.422-.946z" clipRule="evenodd"/>
              <path d="M4 6.75a.75.75 0 00-1.5 0v1.385a5.3 5.3 0 001.619 3.801A5.553 5.553 0 007.25 13.45v1.05H5.5a.75.75 0 000 1.5h5a.75.75 0 000-1.5H8.75v-1.05a5.553 5.553 0 003.131-1.514A5.3 5.3 0 0013.5 8.135V6.75a.75.75 0 00-1.5 0v1.385a3.8 3.8 0 01-1.164 2.725A4.071 4.071 0 018 12a4.071 4.071 0 01-2.836-1.14A3.8 3.8 0 014 8.135V6.75z"/>
            </svg>
            : 
            <svg className="mic" viewBox="0 0 16 16">
              <path d="M8 0c-.78 0-1.538.29-2.104.821a2.862 2.862 0 00-.627.857.75.75 0 001.354.644c.07-.147.17-.286.3-.407A1.578 1.578 0 018 1.5c.413 0 .8.154 1.078.415.276.26.422.601.422.946v3.443a.75.75 0 001.5 0V2.861c0-.775-.329-1.507-.896-2.04A3.077 3.077 0 008 0z"/>
              <path fillRule="evenodd" d="M5 6.06L1.22 2.28a.75.75 0 011.06-1.06l12.5 12.5a.75.75 0 11-1.06 1.06L11.338 12.4a5.575 5.575 0 01-2.588 1.05V14.5h1.75a.75.75 0 010 1.5h-5a.75.75 0 010-1.5h1.75v-1.05a5.553 5.553 0 01-3.131-1.514A5.3 5.3 0 012.5 8.135V6.75a.75.75 0 011.5 0v1.385a3.8 3.8 0 001.164 2.725A4.071 4.071 0 008 12c.815 0 1.602-.24 2.262-.677l-.726-.726A3.113 3.113 0 018 11c-.78 0-1.538-.29-2.104-.821A2.797 2.797 0 015 8.139V6.06zm1.5 1.5v.579c0 .345.146.686.422.946.278.26.665.415 1.078.415.134 0 .266-.016.392-.047L6.5 7.56z" clipRule="evenodd"/>
              <path d="M12.03 6.75a.75.75 0 011.5 0v1.385c0 .266-.02.53-.06.79a.75.75 0 11-1.483-.227c.029-.185.043-.374.043-.563V6.75z"/>
            </svg>
          }
        </button>
        <button onClick={toggleCamera}>
          {camEnabled ? 
            <svg className="cam" viewBox="0 0 24 24">
              <path d="M16 9L21 7V17L16 15M4 5.5H15C15.5523 5.5 16 5.94772 16 6.5V17.5C16 18.0523 15.5523 18.5 15 18.5H4C3.44772 18.5 3 18.0523 3 17.5V6.5C3 5.94772 3.44772 5.5 4 5.5Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            :
            <svg className="cam" viewBox="0 0 24 24" >
              <path d="M3 8V17.5C3 18.0523 3.44772 18.5 4 18.5H14M3 3L21 21M10 5.5H15C15.5523 5.5 16 5.94772 16 6.5V9M16 9V11M16 9L21 7V17" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        </button>
        <button onClick={toggleScreenShare}>
          Поделиться экраном
        </button>
      </div>}
    </div>
  );
}
