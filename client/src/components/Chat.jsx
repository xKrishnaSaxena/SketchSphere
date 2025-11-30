import React, { useState, useEffect, useRef, useContext } from "react";
import { SocketContext } from "../context/SocketContext";
import { EVENTS } from "../utils/constants";

const Chat = ({ roomId, currentUser }) => {
  const socket = useContext(SocketContext);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for incoming messages
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleMessageReceive = (data) => {
      setMessages((prev) => [...prev, data]);
    };

    socket.on(EVENTS.MESSAGE_RECEIVE, handleMessageReceive);

    return () => {
      socket.off(EVENTS.MESSAGE_RECEIVE, handleMessageReceive);
    };
  }, [socket, roomId]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !socket || !roomId || !currentUser) return;

    const messageData = {
      roomId,
      message: inputMessage.trim(),
      userId: currentUser.id,
      userName: currentUser.name,
      timestamp: new Date().toISOString(),
    };

    socket.emit(EVENTS.MESSAGE_SEND, messageData);
    setInputMessage("");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div className="chat-container" ref={chatContainerRef}>
      {/* Collapsed Chat Bar */}
      {!isOpen && (
        <button
          className="chat-toggle-btn"
          onClick={() => setIsOpen(true)}
          title="Open Chat"
        >
          <span className="chat-text">Chat</span>
          {messages.length > 0 && (
            <span className="chat-badge">{messages.length}</span>
          )}
        </button>
      )}

      {/* Expanded Chat Panel */}
      {isOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <h3>Chat</h3>
            <button
              className="chat-close-btn"
              onClick={() => setIsOpen(false)}
              title="Close Chat"
            >
              ✕
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isOwnMessage = msg.userId === currentUser?.id;
                return (
                  <div
                    key={index}
                    className={`chat-message ${
                      isOwnMessage ? "own-message" : ""
                    }`}
                  >
                    <div className="message-header">
                      <span className="message-author">
                        {msg.userName || "Anonymous"}
                      </span>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="message-content">{msg.message}</div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!inputMessage.trim()}
            >
              Send
            </button>
          </form>
        </div>
      )}

      <style>{`
        .chat-container {
          position: fixed !important;
          bottom: 16px !important;
          right: 16px !important;
          top: auto !important;
          left: auto !important;
          z-index: 9999 !important;
          pointer-events: none;
          margin: 0 !important;
          padding: 0 !important;
        }

        .chat-container > * {
          pointer-events: auto;
        }

        .chat-toggle-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          min-width: 80px;
          height: 48px;
          background: #4f46e5;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          transition: background-color 0.2s ease;
          position: relative;
        }

        .chat-toggle-btn:hover {
          background: #4338ca;
        }

        .chat-text {
          color: white;
          font-size: 14px;
          font-weight: 500;
        }

        .chat-badge {
          background: #ef4444;
          color: white;
          border-radius: 12px;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: bold;
        }

        .chat-panel {
          width: 350px;
          height: 500px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
        }

        .chat-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .chat-close-btn {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: background 0.2s;
        }

        .chat-close-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #f8fafc;
        }

        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }

        .chat-messages::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }

        .chat-messages::-webkit-scrollbar-track {
          background: #f1f5f9;
        }

        .chat-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #94a3b8;
          font-size: 14px;
          text-align: center;
        }

        .chat-message {
          margin-bottom: 16px;
        }

        .chat-message.own-message {
          text-align: right;
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 12px;
        }

        .chat-message.own-message .message-header {
          justify-content: flex-end;
        }

        .message-author {
          font-weight: 600;
          color: #4f46e5;
        }

        .chat-message.own-message .message-author {
          color: #6366f1;
        }

        .message-time {
          color: #94a3b8;
          font-size: 11px;
        }

        .message-content {
          background: white;
          padding: 10px 14px;
          border-radius: 12px;
          display: inline-block;
          max-width: 80%;
          word-wrap: break-word;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          text-align: left;
        }

        .chat-message.own-message .message-content {
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
        }

        .chat-input-form {
          display: flex;
          padding: 12px;
          background: white;
          border-top: 1px solid #e5e7eb;
          gap: 8px;
        }

        .chat-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          border-color: #4f46e5;
        }

        .chat-send-btn {
          padding: 10px 20px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .chat-send-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .chat-container {
            bottom: 12px !important;
            right: 12px !important;
            top: auto !important;
            left: auto !important;
          }

          .chat-panel {
            width: calc(100vw - 24px);
            max-width: 350px;
            height: calc(100vh - 120px);
            max-height: 600px;
            border-radius: 8px;
          }
        }

        @media (max-width: 480px) {
          .chat-container {
            bottom: 12px !important;
            right: 12px !important;
            top: auto !important;
            left: auto !important;
          }

          .chat-panel {
            width: calc(100vw - 24px);
            max-width: 320px;
            height: calc(100vh - 100px);
            max-height: 500px;
          }
        }
      `}</style>
    </div>
  );
};

export default Chat;
