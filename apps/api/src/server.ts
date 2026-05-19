import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { registerAuthPlaceholder } from "./plugins/auth.js";
import { registerCors } from "./plugins/cors.js";
import { registerRateLimitPlaceholder } from "./plugins/rate-limit.js";
import { registerWebSocketPlaceholder } from "./plugins/websocket.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      base: {
        service: "hassali-api"
      },
      timestamp: true
    }
  });

  await registerCors(server);
  await registerAuthPlaceholder(server);
  await registerRateLimitPlaceholder(server);
  await registerWebSocketPlaceholder(server);
  await registerHealthRoutes(server);

  return server;
}
