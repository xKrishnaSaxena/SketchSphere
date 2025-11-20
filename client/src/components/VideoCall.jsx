import React, { useEffect, useState, useRef, useContext } from "react";
import Peer from "simple-peer";
import { SocketContext } from "../context/SocketContext";
import { EVENTS } from "../utils/constants";

const VideoCall = () => {
  const socket = useContext(SocketContext);
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
        }
      });

    socket.on(EVENTS.CALL_USER, (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
    });

    return () => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [socket]);

  const callUser = (id) => {
    const peer = new Peer({ initiator: true, trickle: false, stream: stream });

    peer.on("signal", (data) => {
      socket.emit(EVENTS.CALL_USER, {
        userToCall: id,
        signalData: data,
        from: socket.id,
      });
    });

    peer.on("stream", (currentStream) => {
      if (userVideo.current) userVideo.current.srcObject = currentStream;
    });

    socket.on(EVENTS.ANSWER_CALL, (data) => {
      setCallAccepted(true);
      peer.signal(data.signal);
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
    setCallAccepted(true);
    const peer = new Peer({ initiator: false, trickle: false, stream: stream });

    peer.on("signal", (data) => {
      socket.emit(EVENTS.ANSWER_CALL, { signal: data, to: caller });
    });

    peer.on("stream", (currentStream) => {
      if (userVideo.current) userVideo.current.srcObject = currentStream;
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = isVideoOff;
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <div className="video-container">
      <div className="video-grid">
        {/* My Video */}
        {stream && (
          <div className="video-card">
            <video
              playsInline
              muted
              ref={myVideo}
              autoPlay
              className="video-player"
            />
            <span className="video-label">Me</span>
          </div>
        )}
        {/* User Video */}
        {callAccepted && (
          <div className="video-card">
            <video
              playsInline
              ref={userVideo}
              autoPlay
              className="video-player"
            />
            <span className="video-label">Peer</span>
          </div>
        )}
      </div>

      <div className="video-controls">
        <button
          onClick={toggleMute}
          className={`control-btn ${isMuted ? "active" : ""}`}
        >
          {isMuted ? "🔇" : "🎤"}
        </button>
        <button
          onClick={toggleVideo}
          className={`control-btn ${isVideoOff ? "active" : ""}`}
        >
          {isVideoOff ? "📷" : "📹"}
        </button>

        {receivingCall && !callAccepted ? (
          <button onClick={answerCall} className="answer-btn">
            📞 Answer
          </button>
        ) : null}
      </div>

      <style jsx>{`
        .video-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: white;
          padding: 10px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          z-index: 100;
          width: 300px;
        }
        .video-grid {
          display: flex;
          gap: 10px;
          margin-bottom: 10px;
        }
        .video-card {
          position: relative;
          width: 140px;
          height: 100px;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }
        .video-player {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .video-label {
          position: absolute;
          bottom: 5px;
          left: 5px;
          color: white;
          font-size: 10px;
          background: rgba(0, 0, 0, 0.5);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .video-controls {
          display: flex;
          justify-content: center;
          gap: 10px;
        }
        .control-btn {
          background: #f3f4f6;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          cursor: pointer;
        }
        .control-btn.active {
          background: #ef4444;
          color: white;
        }
        .answer-btn {
          background: #22c55e;
          color: white;
          border: none;
          padding: 0 15px;
          border-radius: 18px;
          font-weight: bold;
          cursor: pointer;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default VideoCall;
