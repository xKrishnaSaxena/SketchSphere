import React, { useState } from 'react';

const RoomJoinModal = ({ onJoin, onCreateRoom, isVisible }) => {
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }
    
    // Validate room code format (6 alphanumeric characters)
    const codePattern = /^[A-Z0-9]{6}$/i;
    if (!codePattern.test(roomCode.trim())) {
      setError('Room code must be 6 alphanumeric characters');
      return;
    }
    
    onJoin(userName.trim(), roomCode.trim().toUpperCase());
  };

  const handleCreateRoom = () => {
    setError('');
    if (!userName.trim()) {
      setError('Please enter your name first');
      return;
    }
    onCreateRoom(userName.trim());
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomCode(value);
    setError('');
  };

  if (!isVisible) return null;

  return (
    <>
      <style>{`
        .room-join-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.9) 0%, rgba(139, 92, 246, 0.9) 100%);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.3s ease-out;
          padding: 20px;
        }

        .room-join-modal {
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border-radius: 24px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .room-join-header {
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          padding: 2.5rem 2rem 2rem;
          text-align: center;
          border-bottom: 1px solid rgba(79, 70, 229, 0.1);
        }

        .room-join-header h2 {
          font-size: 2rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          color: #1e293b;
          font-family: 'Poppins', sans-serif;
          letter-spacing: -0.02em;
        }

        .room-join-header p {
          font-size: 0.95rem;
          color: #64748b;
          margin: 0;
          font-weight: 400;
        }

        .room-join-form {
          padding: 2rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
          margin-bottom: 0.5rem;
          font-family: 'Poppins', sans-serif;
        }

        .form-group input {
          width: 100%;
          padding: 0.875rem 1rem;
          font-size: 1rem;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          color: #1e293b;
          transition: all 0.2s ease;
          font-family: 'Inter', sans-serif;
          box-sizing: border-box;
        }

        .form-group input:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
        }

        .form-group input::placeholder {
          color: #94a3b8;
        }

        .room-code-input {
          text-transform: uppercase !important;
          letter-spacing: 0.15em !important;
          font-size: 1.25rem !important;
          text-align: center !important;
          font-family: 'Courier New', monospace !important;
          font-weight: 600 !important;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%) !important;
        }

        .form-hint {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 0.5rem;
          display: block;
        }

        .error-message {
          background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
          color: #dc2626;
          padding: 0.875rem 1rem;
          border-radius: 12px;
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
          border: 1px solid #fca5a5;
          font-weight: 500;
          animation: shake 0.3s ease;
        }

        .form-actions {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 2rem;
        }

        .btn-primary {
          width: 100%;
          padding: 1rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Poppins', sans-serif;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
          background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%);
        }

        .btn-primary:active {
          transform: translateY(0);
        }

        .btn-secondary {
          width: 100%;
          padding: 0.875rem 1.5rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: #4f46e5;
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%);
          border: 2px solid rgba(79, 70, 229, 0.2);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Poppins', sans-serif;
        }

        .btn-secondary:hover {
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%);
          border-color: rgba(79, 70, 229, 0.3);
          transform: translateY(-1px);
        }

        .modal-footer {
          padding: 1.5rem 2rem;
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
          border-top: 1px solid rgba(79, 70, 229, 0.1);
          text-align: center;
        }

        .modal-footer p {
          margin: 0;
          font-size: 0.875rem;
          color: #64748b;
          font-weight: 400;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
      
      <div className="room-join-overlay">
        <div className="room-join-modal">
          <div className="room-join-header">
            <h2>🎨 Join SketchSphere</h2>
            <p>Enter your name and room code to start collaborating</p>
          </div>
          
          <form onSubmit={handleSubmit} className="room-join-form">
            <div className="form-group">
              <label htmlFor="userName">Your Name</label>
              <input
                type="text"
                id="userName"
                value={userName}
                onChange={(e) => {
                  setUserName(e.target.value);
                  setError('');
                }}
                placeholder="Enter your name"
                required
                autoFocus
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="roomCode">Room Code</label>
              <input
                type="text"
                id="roomCode"
                className="room-code-input"
                value={roomCode}
                onChange={handleCodeChange}
                placeholder="ENTER 6-DIGIT CODE"
                required
                maxLength={6}
              />
              <span className="form-hint">
                Enter the 6-character room code shared by the host
              </span>
            </div>
            
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
            
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Join Room
              </button>
              <button 
                type="button" 
                className="btn-secondary"
                onClick={handleCreateRoom}
              >
                Create New Room
              </button>
            </div>
          </form>
          
          <div className="modal-footer">
            <p>💡 Don't have a code? Click "Create New Room" to start a new session</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default RoomJoinModal; 