import type { FastifyInstance } from "fastify";

export async function registerRateLimitPlaceholder(server: FastifyInstance) {
  server.addHook("onRequest", async (request) => {
    request.log.debug("rate_limit_placeholder");
  });
}
