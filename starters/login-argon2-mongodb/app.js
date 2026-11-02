import express from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { pingDatabase } from "./config/database.js";
import { HttpError, rejectUnsafeJson, rejectUnsafeQuery } from "./security/input.js";

// Building the app apart from app.listen lets tests use it without a database.
export function createApp({
  checkDatabase = pingDatabase,
  clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173",
  auth = null,
  trustProxy = false,
  // Requests allowed per visitor IP per 5 minutes, across the whole API.
  globalRateLimitMax = 300,
  // A function that adds your routers. It runs after all the security below
  // and before the 404 handler.
  mountRoutes = null,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Never trust X-Forwarded-* headers unless the deployment says to.
  app.set("trust proxy", trustProxy);
  // The "simple" parser never builds nested objects, so ?email[$ne]=x stays a
  // harmless literal key instead of becoming { email: { $ne: "x" } }.
  app.set("query parser", "simple");

  // A random ID ties a user's error message to the matching log line. An ID
  // sent by the client is ignored, because it could fake log entries.
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set("X-Request-Id", req.id);
    next();
  });

  app.use(helmet());

  // Compare scheme://host:port, so a trailing slash in CLIENT_ORIGIN still
  // matches the Origin header that browsers send.
  const allowedOrigin = new URL(clientOrigin).origin;

  // Only the configured frontend gets credentialed CORS headers. CORS is a
  // browser policy, not a replacement for authentication or CSRF checks.
  app.use(cors({
    origin(origin, callback) {
      callback(null, origin === allowedOrigin);
    },
    credentials: true,
  }));

  // One overall limit per visitor IP, on top of the stricter login limits in
  // auth.js. It comes after cors() so the website can read the 429 response,
  // and /api/health is skipped so a host's health checks never fail. This
  // counter lives in memory, so it resets on restart. Large floods have to be
  // stopped before they reach the server, for example by Cloudflare.
  app.use(rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: globalRateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.path === "/api/health",
    message: { error: "Too many requests. Please slow down and try again shortly." },
  }));

  // API answers may hold private data, so nothing may store them. A public,
  // cacheable route can override this.
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.use(express.json({ limit: "100kb" }));
  app.use(rejectUnsafeJson);
  app.use(rejectUnsafeQuery);

  if (auth) {
    app.use(auth.sessionMiddleware);
    // Every unsafe API method needs a CSRF token, even if a router forgets it.
    app.use("/api", auth.csrfForMutations);
    app.use("/api/auth", auth.router);
    // Anything you put under these two prefixes is protected automatically.
    app.use("/api/admin", auth.requireAdmin);
    app.use("/api/account", auth.requireAuth);
  }

  // Liveness checks Express. The route below it also checks MongoDB.
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health/database", async (req, res) => {
    try {
      await checkDatabase();
      res.json({ status: "ok", database: "connected" });
    } catch {
      // Never expose the URI, password, server address, or driver stack.
      res.status(503).json({ status: "error", database: "unavailable" });
    }
  });

  // Routes are refused without auth, so they can never run with the guards missing.
  if (mountRoutes) {
    if (!auth) throw new Error("mountRoutes requires authentication middleware (auth).");
    mountRoutes(app, { auth });
  }

  app.use((req, res) => {
    res.status(404).json({ error: "Route not found." });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body is too large." });
    }
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON request body." });
    }
    // Other problems with the request itself are the client's mistake, not a 500.
    if (error.expose === true && Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ error: "The request could not be processed." });
    }
    // Database validation errors mean the data was invalid. Do not echo details.
    if (["ValidationError", "CastError", "StrictModeError"].includes(error.name)) {
      return res.status(400).json({ error: "The request contains invalid data." });
    }
    // Log without the request body, which may hold passwords, and without the
    // stack in production, because MongoDB messages can include emails.
    console.error(JSON.stringify({
      level: "error",
      requestId: req.id,
      method: req.method,
      path: req.path,
      name: error?.name,
      code: error?.code,
      ...(process.env.NODE_ENV === "production" ? {} : { stack: error?.stack }),
    }));
    res.status(500).json({ error: "An unexpected server error occurred.", requestId: req.id });
  });

  return app;
}
