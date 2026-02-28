import express from "express";
import cors from "cors";
import path from "node:path";
import type { QueueAdapter } from "./adapter.js";
import type { ServerConfig } from "./config.js";
import { ServerConfigSchema } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createQueueRoutes } from "./routes/queues.js";

export interface CreateServerOptions {
  adapter: QueueAdapter;
  config?: Partial<ServerConfig>;
}

export function createServer(options: CreateServerOptions): express.Express {
  const config = ServerConfigSchema.parse(options.config ?? {});
  const app = express();

  // CORS
  app.use(
    cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    }),
  );

  // Body parsing
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // API routes
  app.use("/api/v1/queues", createQueueRoutes(options.adapter));

  // Static file serving for bundled React UI
  if (config.staticDir) {
    app.use(express.static(config.staticDir));
    // SPA fallback — serve index.html for non-API routes
    app.get("*", (_req, res) => {
      res.sendFile(path.join(config.staticDir!, "index.html"));
    });
  }

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

export function startServer(
  options: CreateServerOptions,
): Promise<import("node:http").Server> {
  const config = ServerConfigSchema.parse(options.config ?? {});
  const app = createServer(options);

  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      console.log(`[queue-vision] Server listening on port ${config.port}`);
      resolve(server);
    });
  });
}
