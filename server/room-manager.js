const rooms = new Map();

module.exports = {
  addUser: (roomId, user) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: [],
        elements: [], // Stores the board state
      });
    }
    const room = rooms.get(roomId);
    if (!room.users.some((u) => u.id === user.id)) {
      room.users.push(user);
    }
  },

  removeUser: (userId) => {
    const userRooms = [];
    rooms.forEach((room, roomId) => {
      room.users = room.users.filter((user) => user.id !== userId);
      if (room.users.length === 0) {
        rooms.delete(roomId); // Cleanup empty rooms
      } else {
        userRooms.push(roomId);
      }
    });
    return userRooms;
  },

  getUsers: (roomId) => {
    return rooms.has(roomId) ? [...rooms.get(roomId).users] : [];
  },

  addElement: (roomId, element) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).elements.push(element);
    }
  },

  // NEW: Update a specific element (points for drawing, or x/y for moving)
  updateElement: (roomId, elementId, updates) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const index = room.elements.findIndex((el) => el.id === elementId);
      if (index !== -1) {
        // Merge existing properties with updates
        room.elements[index] = { ...room.elements[index], ...updates };
      }
    }
  },

  // NEW: Specific handler to append points to a line (optimization)
  appendPoint: (roomId, elementId, point) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const element = room.elements.find((el) => el.id === elementId);
      if (element && element.points) {
        element.points.push(point[0], point[1]); // Flattened array push
      }
    }
  },

  clearElements: (roomId) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).elements = [];
    }
  },

  getElements: (roomId) => {
    return rooms.has(roomId) ? [...rooms.get(roomId).elements] : [];
  },
};
