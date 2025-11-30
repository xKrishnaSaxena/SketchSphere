import React, { useState, useEffect, useContext, useRef } from 'react';
import Whiteboard from './components/whiteboard';
import UserPanel from './components/UserPanel';
import VideoCall from './components/VideoCall';
import RoomJoinModal from './components/RoomJoinModal';
import Chat from './components/Chat';
import { SocketContext } from './context/SocketContext';
import { EVENTS } from './utils/constants';

// Generate a random 6-character room code
const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

function App() {
  const socket = useContext(SocketContext);
  const [users, setUsers] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [elements, setElements] = useState([]);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const whiteboardRef = useRef(null);

  // Restore room state only on page refresh (not initial load)
  useEffect(() => {
    if (!socket) return;
    
    // Check if this is a page refresh (navigation type 1 = reload)
    const isRefresh = performance.getEntriesByType('navigation')[0]?.type === 'reload' ||
                      performance.navigation?.type === 1;
    
    if (!isRefresh) {
      // Initial load - always show join modal
      return;
    }
    
    const restoreRoomState = () => {
      const savedRoomCode = localStorage.getItem('sketchsphere_roomCode');
      const savedUserName = localStorage.getItem('sketchsphere_userName');
      const savedIsHost = localStorage.getItem('sketchsphere_isHost') === 'true';
      
      if (savedRoomCode && savedUserName) {
        const user = {
          id: socket.id,
          name: savedUserName
        };
        setCurrentUser(user);
        setRoomId(savedRoomCode);
        setRoomCode(savedRoomCode);
        setIsHost(savedIsHost);
        setShowJoinModal(false);
        
        // Rejoin the room
        socket.emit(EVENTS.JOIN_ROOM, { roomId: savedRoomCode, user });
      }
    };
    
    if (socket.connected) {
      restoreRoomState();
    } else {
      // Wait for socket to connect
      const handleConnect = () => {
        restoreRoomState();
      };
      
      socket.on('connect', handleConnect);
      
      return () => {
        socket.off('connect', handleConnect);
      };
    }
  }, [socket]);

  // Handle room joining
  const handleJoinRoom = (userName, code) => {
    if (!socket) return;
    
    const user = {
      id: socket.id,
      name: userName
    };
    setCurrentUser(user);
    
    // Clear elements before joining (board-state will populate them)
    setElements([]);
    setUsers([]);
    
    // Use the code as roomId (server will validate)
    setRoomId(code);
    setRoomCode(code);
    setIsHost(false);
    setShowJoinModal(false);
    
    // Save to localStorage
    localStorage.setItem('sketchsphere_roomCode', code);
    localStorage.setItem('sketchsphere_userName', userName);
    localStorage.setItem('sketchsphere_isHost', 'false');
    
    socket.emit(EVENTS.JOIN_ROOM, { roomId: code, user });
  };

  // Handle room creation
  const handleCreateRoom = (userName) => {
    if (!socket) return;
    
    const newCode = generateRoomCode();
    const user = {
      id: socket.id,
      name: userName
    };
    setCurrentUser(user);
    
    // Clear elements before joining (board-state will populate them)
    setElements([]);
    setUsers([]);
    
    setRoomId(newCode);
    setRoomCode(newCode);
    setIsHost(true);
    setShowJoinModal(false);
    
    // Save to localStorage
    localStorage.setItem('sketchsphere_roomCode', newCode);
    localStorage.setItem('sketchsphere_userName', userName);
    localStorage.setItem('sketchsphere_isHost', 'true');
    
    socket.emit(EVENTS.JOIN_ROOM, { roomId: newCode, user });
  };

  // Set up board-state listener globally (not dependent on roomId) to avoid race conditions
  // This ensures the listener is ready before we emit JOIN_ROOM
  useEffect(() => {
    if (!socket) return;

    const handleBoardState = (boardElements) => {
      console.log('Received board-state:', boardElements?.length || 0, 'elements');
      // Always update elements when board-state is received (server only sends it on room join)
      setElements(boardElements || []);
    };

    socket.on('board-state', handleBoardState);

    return () => {
      socket.off('board-state', handleBoardState);
    };
  }, [socket]);


  useEffect(() => {
    if (!socket || !roomId) return;

    // Listen for user events
    const handleUserJoined = (data) => {
      setUsers(prev => {
        if (!prev.find(u => u.id === data.user.id)) {
          return [...prev, data.user];
        }
        return prev;
      });
    };

    const handleUserLeft = (data) => {
      setUsers(prev => prev.filter(u => u.id !== data.userId));
    };

    const handleRoomUsers = (data) => {
      setUsers(data.users || []);
    };

    socket.on(EVENTS.USER_JOINED, handleUserJoined);
    socket.on(EVENTS.USER_LEFT, handleUserLeft);
    socket.on('room-users', handleRoomUsers);

    return () => {
      socket.off(EVENTS.USER_JOINED, handleUserJoined);
      socket.off(EVENTS.USER_LEFT, handleUserLeft);
      socket.off('room-users', handleRoomUsers);
    };
  }, [socket, roomId]);

  // Header toolbar actions
  const handleErase = () => {
    // Call the whiteboard's erase method
    if (whiteboardRef.current) {
      whiteboardRef.current.handleErase();
    }
  };

  return (
    <div className="app">
      <RoomJoinModal 
        isVisible={showJoinModal}
        onJoin={handleJoinRoom}
        onCreateRoom={handleCreateRoom}
      />
      
      {!showJoinModal && (
        <div className="main-content">
          <div className="header">
            <div className="header-left">
              <h1>🎨 SketchSphere</h1>
              {roomCode && (
                <div className="room-code-display" style={{
                  marginLeft: '20px',
                  padding: '6px 12px',
                  background: '#f0f8ff',
                  border: '1px solid #4f46e5',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  letterSpacing: '0.1em',
                  fontWeight: '600',
                  color: '#4f46e5'
                }}>
                  Room: {roomCode}
                  {isHost && (
                    <span style={{ 
                      marginLeft: '8px', 
                      fontSize: '12px', 
                      color: '#22c55e',
                      fontWeight: 'normal'
                    }}>
                      (Host)
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="header-toolbar">
              <button 
                onClick={async () => {
                  if (roomCode) {
                    try {
                      await navigator.clipboard.writeText(roomCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                    }
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: copied ? '#22c55e' : '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'background-color 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {copied ? (
                  <>
                    <span>✓</span>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
          </div>
          
          <Whiteboard 
            ref={whiteboardRef}
            roomId={roomId} 
            users={users}
            elements={elements}
            setElements={setElements}
            onErase={handleErase}
            currentUser={currentUser}
          />
          <VideoCall />
          {roomId && currentUser && (
            <Chat roomId={roomId} currentUser={currentUser} />
          )}
        </div>
      )}
      
      {/* <UserPanel 
        users={users} 
        roomId={roomId}
      /> */}
    </div>
  );
}

export default App;