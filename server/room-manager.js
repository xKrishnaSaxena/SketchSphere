const rooms = new Map();

module.exports = {
  addUser: (roomId, user) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: [],
        elements: []
      });
    }
    const room = rooms.get(roomId);
    if (!room.users.some(u => u.id === user.id)) {
      room.users.push(user);
    }
  },

  removeUser: (userId) => {
    const userRooms = [];
    rooms.forEach((room, roomId) => {
      room.users = room.users.filter(user => user.id !== userId);
      if (room.users.length === 0) {
        rooms.delete(roomId);
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

  updateElement: (roomId, elementId, updatedAttrs) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const index = room.elements.findIndex(el => el.id === elementId);
    if (index === -1) return;
    
    const existingElement = room.elements[index];
    
    // If the type is changing (e.g., from freehand to circle), completely replace the element
    if (updatedAttrs.type && updatedAttrs.type !== existingElement.type) {
      // Complete replacement for shape recognition
      const newElement = {
        id: existingElement.id,
        ...updatedAttrs,
        // Ensure color and strokeWidth are preserved
        color: updatedAttrs.color !== undefined ? updatedAttrs.color : existingElement.color,
        strokeWidth: updatedAttrs.strokeWidth !== undefined ? updatedAttrs.strokeWidth : existingElement.strokeWidth,
      };
      
      // Remove properties that shouldn't exist for the new shape type
      if (newElement.type === 'circle') {
        delete newElement.points;
        delete newElement.width;
        delete newElement.height;
        delete newElement.side;
      } else if (newElement.type === 'rectangle') {
        delete newElement.points;
        delete newElement.radius;
        delete newElement.side;
      } else if (newElement.type === 'square') {
        delete newElement.points;
        delete newElement.radius;
        delete newElement.width;
        delete newElement.height;
      } else if (newElement.type === 'triangle' || 
                 newElement.type === 'hexagon' || 
                 newElement.type === 'pentagon' ||
                 newElement.type === 'line') {
        delete newElement.radius;
        delete newElement.width;
        delete newElement.height;
        delete newElement.side;
      }
      
      room.elements[index] = newElement;
    } else {
      // Partial update (like transform, color change, etc.)
      room.elements[index] = {
        ...existingElement,
        ...updatedAttrs
      };
    }
  },

  replaceTempElement: (roomId, newElement) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.elements = [
        ...room.elements.filter(el => !el.temp),
        newElement
      ];
    }
  },

  clearElements: (roomId) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).elements = [];
    }
  },

  getElements: (roomId) => {
    return rooms.has(roomId) ? [...rooms.get(roomId).elements] : [];
  }
};