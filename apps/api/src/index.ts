import { env } from "./config/env.js";
import { buildServer } from "./server.js";

const server = await buildServer();

try {
  await server.listen({
    host: env.API_HOST,
    port: env.API_PORT
  });
} catch (error) {
  server.log.error({ error }, "api_start_failed");
  process.exit(1);
}
