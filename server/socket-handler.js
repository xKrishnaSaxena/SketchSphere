const { EVENTS } = require("./constants");
const roomManager = require("./room-manager");

module.exports = (socket, io) => {
  // --- Room Management ---
  socket.on(EVENTS.JOIN_ROOM, ({ roomId, user }) => {
    socket.join(roomId);
    roomManager.addUser(roomId, user);

    // Notify others
    io.to(roomId).emit(EVENTS.USER_JOINED, { user });

    // Sync state to the new user
    const users = roomManager.getUsers(roomId);
    io.to(roomId).emit("room-users", { users });

    const elements = roomManager.getElements(roomId);
    socket.emit("board-state", elements);
  });

  // --- Drawing & Collaboration ---

  socket.on(EVENTS.DRAW_START, ({ roomId, element }) => {
    roomManager.addElement(roomId, element);
    // Broadcast to everyone else in room
    socket.to(roomId).emit(EVENTS.DRAW_START, element);
  });

  socket.on(EVENTS.DRAW_MOVE, ({ roomId, elementId, point }) => {
    // Update server state so refreshing preserves the drawing
    roomManager.appendPoint(roomId, elementId, point);
    // Broadcast just the new point and ID to others for performance
    socket.to(roomId).emit(EVENTS.DRAW_MOVE, { elementId, point });
  });

  socket.on(EVENTS.DRAW_END, ({ roomId }) => {
    socket.to(roomId).emit(EVENTS.DRAW_END);
  });

  socket.on(EVENTS.SHAPE_UPDATE, ({ roomId, elementId, updatedAttrs }) => {
    roomManager.updateElement(roomId, elementId, updatedAttrs);
    socket.to(roomId).emit(EVENTS.SHAPE_UPDATE, { elementId, updatedAttrs });
  });

  socket.on(EVENTS.CLEAR_BOARD, ({ roomId }) => {
    roomManager.clearElements(roomId);
    socket.to(roomId).emit(EVENTS.CLEAR_BOARD);
  });

  // --- Video Call Signaling (WebRTC) ---
  socket.on(EVENTS.CALL_USER, ({ userToCall, signalData, from }) => {
    io.to(userToCall).emit(EVENTS.CALL_USER, { signal: signalData, from });
  });

  socket.on(EVENTS.ANSWER_CALL, ({ signal, to }) => {
    io.to(to).emit(EVENTS.ANSWER_CALL, { signal });
  });

  socket.on("disconnect", () => {
    const rooms = roomManager.removeUser(socket.id);
    rooms.forEach((roomId) => {
      io.to(roomId).emit(EVENTS.USER_LEFT, { userId: socket.id });
      io.to(roomId).emit("room-users", { users: roomManager.getUsers(roomId) });
    });
  });
};
