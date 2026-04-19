/**
 * Custom Next.js server entry point.
 *
 * Runs a standard Node.js HTTP server that:
 *  1. Handles all /api/* routes via an Express sub-router
 *     (required for raw UDP/TCP access: SSDP, WebSocket, binary transfer)
 *  2. Delegates all other routes to Next.js
 */

import { createServer } from "http";
import next from "next";
import express from "express";
import { apiRouter } from "./src/server/api-routes";
import { tvManager } from "./src/server/tv-connection-manager";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();

  // Trust the first proxy hop so express-rate-limit keys on the real client IP
  // when the app is deployed behind nginx/Caddy/etc.
  expressApp.set("trust proxy", 1);

  // Security headers
  expressApp.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    );
    next();
  });

  // Parse JSON bodies for /api/* routes
  expressApp.use(express.json());

  // Samsung TV API routes
  expressApp.use("/api", apiRouter);

  // All other requests → Next.js
  expressApp.all("*", (req, res) => {
    handle(req, res);
  });

  const server = createServer(expressApp);

  server.listen(port, async () => {
    console.log(`\n> Samsung Frame TV Uploader ready on http://localhost:${port}`);
    console.log(`> Environment: ${dev ? "development" : "production"}\n`);
    // Restore previously-paired TVs from the token store
    await tvManager.initialize();
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${port} is already in use. Set a different PORT in .env\n`);
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
  });
});
