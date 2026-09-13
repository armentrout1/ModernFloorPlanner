import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";

/** Production assets have no dependency on Vite or its development plugins. */
export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(path.join(distPath, "index.html")))
    throw new Error("The built client is missing. Run npm run build before starting the server.");

  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    // Missing scripts/styles must not receive the SPA document with a 200 status.
    if (req.path.startsWith("/assets/") || path.extname(req.path) || !req.accepts("html")) {
      res.status(404).type("text/plain").send("Not found"); return;
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
  app.use((_req, res) => { res.status(404).type("text/plain").send("Not found"); });
}
