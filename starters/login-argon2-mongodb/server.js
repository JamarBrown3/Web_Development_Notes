import http from "node:http";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { getPort, getTrustProxy } from "./config/env.js";
import { createAuth } from "./security/auth.js";
import { createAuthService } from "./services/authService.js";
import {
  connectDatabase,
  pingDatabase,
  disconnectDatabase,
  explainDatabaseError,
} from "./config/database.js";
import itemRoutes from "./routes/items.js";

let server;
let stopping = false;

// Limits for slow clients. A "Slowloris" bot sends a request a few bytes at a
// time to keep connections busy. These settings cut it off with a 408.
const HTTP_LIMITS = {
  headersTimeout: 20_000, // the request headers must arrive within 20 s
  requestTimeout: 30_000, // the whole request must arrive within 30 s
  connectionsCheckingInterval: 5_000, // how often Node checks those deadlines
};
// Hosting proxies can keep idle connections open for 120 s. Node must keep them
// slightly longer, or a visitor sometimes sees a random 502 error.
const PRODUCTION_KEEP_ALIVE_MS = 121_000;

async function shutdown() {
  if (stopping) return;
  stopping = true;
  // Do not wait forever if a client holds a connection open.
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
  } finally {
    clearTimeout(timer);
  }
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});

// Remember which step failed, so a settings mistake is not reported as a
// database problem. Database errors go through explainDatabaseError, so
// connection strings are never printed.
let stage = "configuration";

try {
  const port = getPort();
  const trustProxy = getTrustProxy();

  stage = "database";
  await connectDatabase();
  await pingDatabase();
  // Do not accept registrations before the unique indexes exist.
  await Promise.all([
    mongoose.model("User").init(),
    mongoose.model("PasswordResetToken").init(),
  ]);
  console.log("MongoDB connection and ping succeeded.");

  stage = "authentication setup";
  const service = createAuthService({
    resetOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    // YOUR EMAIL SENDER GOES HERE. Password reset stays off (503) until this
    // is an async function that sends the link: async ({ to, resetUrl }) => {}
    deliverResetEmail: null,
  });
  const auth = createAuth({ connection: mongoose.connection, service });
  await auth.ready();

  stage = "HTTP server";
  server = http.createServer(
    HTTP_LIMITS,
    createApp({
      auth,
      trustProxy,
      // YOUR ROUTES GO HERE.
      mountRoutes: (app, { auth }) => {
        app.use("/api/items", itemRoutes(auth));
      },
    }),
  );
  if (process.env.NODE_ENV === "production")
    server.keepAliveTimeout = PRODUCTION_KEEP_ALIVE_MS;
  server.listen(
    port,
    process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
    () => {
      console.log(`API listening on http://localhost:${port}`);
    },
  );
  server.on("error", async (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Port is already in use. Choose another PORT in .env."
        : "HTTP server failed to start.",
    );
    process.exitCode = 1;
    await shutdown();
  });
} catch (error) {
  console.error(
    `Startup failed during ${stage}:`,
    stage === "database" ? explainDatabaseError(error) : error.message,
  );
  process.exitCode = 1;
  await disconnectDatabase();
}
