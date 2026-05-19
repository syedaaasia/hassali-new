import type { FastifyInstance } from "fastify";

export type ApiAuthContext = {
  isAuthenticated: boolean;
  userId?: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth: ApiAuthContext;
  }
}

export async function registerAuthPlaceholder(server: FastifyInstance) {
  server.decorateRequest("auth", {
    getter() {
      return {
        isAuthenticated: false
      };
    }
  });

  server.addHook("onRequest", async (request) => {
    const hasBearerToken = request.headers.authorization?.startsWith("Bearer ") ?? false;

    request.auth = {
      isAuthenticated: false
    };

    if (hasBearerToken) {
      request.log.debug("auth_token_present");
    }
  });
}
