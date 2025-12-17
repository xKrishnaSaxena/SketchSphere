import io from "socket.io-client";

const SOCKET_URL = "https://api-sketchsphere.stelliform.xyz";
export const socket = io(SOCKET_URL);
