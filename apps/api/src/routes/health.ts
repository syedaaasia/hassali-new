import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(server: FastifyInstance) {
  server.get("/health", async () => ({
    ok: true,
    service: "hassali-api"
  }));
}
