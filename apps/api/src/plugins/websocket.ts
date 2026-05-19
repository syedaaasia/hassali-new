import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { registerStatusSocket } from "../ws/status.js";

export async function registerWebSocketPlaceholder(server: FastifyInstance) {
  await server.register(websocket);
  await registerStatusSocket(server);
}
