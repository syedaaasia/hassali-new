import type { FastifyInstance } from "fastify";

export async function registerStatusSocket(server: FastifyInstance) {
  server.get("/ws/status", { websocket: true }, async (socket) => {
    socket.send(JSON.stringify({ type: "status", state: "ready" }));
  });
}
