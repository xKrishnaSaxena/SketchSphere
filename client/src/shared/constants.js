const SHAPES = {
  CIRCLE: "circle",
  RECTANGLE: "rectangle",
  SQUARE: "square",
  TRIANGLE: "triangle",
  LINE: "line",
  FREEHAND: "freehand",
  ERASER: "eraser",
  TEXT: "text",
  HEXAGON: "hexagon",
  PENTAGON: "pentagon",
};

const EVENTS = {
  // Room events
  JOIN_ROOM: "join-room",
  USER_JOINED: "user-joined",
  USER_LEFT: "user-left",

  // Drawing events
  DRAW_START: "draw-start",
  DRAW_MOVE: "draw-move",
  DRAW_END: "draw-end",
  SHAPE_UPDATE: "shape-update", // For resizing/moving
  SHAPE_RECOGNIZED: "shape-recognized", // For AI replacement
  CLEAR_BOARD: "clear-board",

  // Video Call Signaling
  CALL_USER: "call-user",
  ANSWER_CALL: "answer-call",
  ICE_CANDIDATE: "ice-candidate",
};

module.exports = { SHAPES, EVENTS };
