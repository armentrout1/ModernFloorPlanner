import express from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { log } from "./log";
import { httpErrorHandler } from "./httpErrors";

import { privateApiResponses } from './authorizedRoutes';
const app = express();
app.use('/api', privateApiResponses);
app.use('/api/physical-plans', express.json({ limit: '4mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Log request metadata, never saved sketch contents or response bodies.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  const portText = process.env.PORT ?? "5000";
  const port = Number(portText);
  const host = process.env.HOST ?? "0.0.0.0";
  if (!/^[0-9]+$/.test(portText) || !Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      !host || host !== host.trim() || !/^[A-Za-z0-9_.:%-]+$/.test(host))
    throw new Error("Invalid listener configuration");
  const server = await registerRoutes(app);

  // Set up the client after API routes so its catch-all does not intercept them.
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.use(httpErrorHandler);

  server.once("error", () => {
    // Do not include environment values or provider details in startup errors.
    console.error("Application listener failed to start.");
    process.exitCode = 1;
  });
  server.listen({ port, host }, () => {
    log(`serving on ${host}:${port} (process ${process.pid})`);
  });
})().catch(() => {
  console.error("Application startup failed. Check the build and listener configuration.");
  process.exitCode = 1;
});
