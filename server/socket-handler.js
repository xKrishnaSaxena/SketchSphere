const { EVENTS } = require("./constants");
const roomManager = require("./room-manager");

module.exports = (socket, io) => {
  // Join a room
  socket.on(EVENTS.JOIN_ROOM, ({ roomId, user }) => {
    socket.join(roomId);
    roomManager.addUser(roomId, user);

    // Notify room about new user
    io.to(roomId).emit(EVENTS.USER_JOINED, {
      user: user,
    });

    // Send current users list to all users in room
    const users = roomManager.getUsers(roomId);
    io.to(roomId).emit("room-users", { users });

    // Send existing elements to new user
    const elements = roomManager.getElements(roomId);
    socket.emit("board-state", elements);

    console.log(`User ${user.name} joined room ${roomId}`);
  });

  // Drawing events
  socket.on(EVENTS.DRAW_START, ({ roomId, element, userId }) => {
    // Add userId to element for tracking
    const elementWithUser = { ...element, userId: userId || socket.id };
    roomManager.addElement(roomId, elementWithUser);
    socket.to(roomId).emit(EVENTS.DRAW_START, elementWithUser);
  });

  socket.on(EVENTS.DRAW_MOVE, ({ roomId, elementId, point, userId }) => {
    socket.to(roomId).emit(EVENTS.DRAW_MOVE, {
      elementId,
      point,
      userId: userId || socket.id,
    });
  });

  socket.on(EVENTS.DRAW_END, ({ roomId, elementId, userId }) => {
    socket.to(roomId).emit(EVENTS.DRAW_END, {
      elementId,
      userId: userId || socket.id,
    });
  });

  socket.on(EVENTS.SHAPE_RECOGNIZED, ({ roomId, shape, userId }) => {
    // Add the corrected shape to the room without removing original drawings
    const shapeWithUser = { ...shape, userId: userId || socket.id };
    roomManager.addElement(roomId, shapeWithUser);
    io.to(roomId).emit(EVENTS.SHAPE_RECOGNIZED, shapeWithUser);
  });

  socket.on(
    EVENTS.SHAPE_UPDATE,
    ({ roomId, elementId, updatedAttrs, userId }) => {
      roomManager.updateElement(roomId, elementId, updatedAttrs);
      socket.to(roomId).emit(EVENTS.SHAPE_UPDATE, {
        elementId,
        updatedAttrs,
        userId: userId || socket.id,
      });
    }
  );

  socket.on(EVENTS.CLEAR_BOARD, ({ roomId }) => {
    // Clear all elements in the room
    roomManager.clearElements(roomId);
    io.to(roomId).emit(EVENTS.CLEAR_BOARD);
    console.log(`Board cleared in room ${roomId}`);
  });

  // Chat events
  socket.on(
    EVENTS.MESSAGE_SEND,
    ({ roomId, message, userId, userName, timestamp }) => {
      const messageData = {
        message,
        userId: userId || socket.id,
        userName: userName || "Anonymous",
        timestamp: timestamp || new Date().toISOString(),
      };
      // Broadcast message to all users in the room
      io.to(roomId).emit(EVENTS.MESSAGE_RECEIVE, messageData);
      console.log(`Message from ${userName} in room ${roomId}: ${message}`);
    }
  );

  // Cleanup on disconnect
  socket.on("disconnect", () => {
    const rooms = roomManager.removeUser(socket.id);
    rooms.forEach((roomId) => {
      io.to(roomId).emit(EVENTS.USER_LEFT, {
        userId: socket.id,
      });

      // Send updated users list
      const users = roomManager.getUsers(roomId);
      io.to(roomId).emit("room-users", { users });
    });

    console.log(`User ${socket.id} disconnected`);
  });
};
