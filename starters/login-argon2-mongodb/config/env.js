import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Resolve .env relative to this file, not the terminal's working directory.
// Hosting settings take precedence over .env. npm test never reads .env,
// so a test can never reach your real database or real secrets.
if (process.env.NODE_ENV !== "test") {
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  });
}

// Read and validate the MongoDB connection settings.
// This does not connect to the database yet.
export function getDatabaseConfig() {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB_NAME?.trim();

  // Accept either supported MongoDB connection-string scheme.
  const validScheme =
    uri?.startsWith("mongodb://") || uri?.startsWith("mongodb+srv://");

  if (!validScheme) {
    throw new Error("Set a valid MONGODB_URI in server/.env.");
  }

  // Letters, numbers, underscores, and hyphens only.
  if (!dbName || !/^[a-zA-Z0-9_-]+$/.test(dbName)) {
    throw new Error(
      "MONGODB_DB_NAME must contain only letters, numbers, underscores, and hyphens.",
    );
  }

  // Return only the settings the database module needs.
  return { uri, dbName };
}

// Environment variables are strings.
// Convert the port to a number and validate it.

export function getPort() {
  const port = Number(process.env.PORT || 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

// How many reverse proxies sit in front of the API.
//
// On a host like Render, every visitor arrives through the host's proxy. If
// Express is not told about it, every visitor seems to share one IP address,
// so one bot's bad logins would rate limit the whole website. Secure cookies
// also need this setting behind a proxy.
//
// Production refuses to start until you choose a value:
//   TRUST_PROXY_HOPS=1   one proxy, such as Render
//   TRUST_PROXY_HOPS=2   two proxies, such as Render behind Cloudflare
//   TRUST_PROXY_HOPS=0   no proxy at all
// Never set a number higher than the real number of proxies: visitors could then
// fake their IP address with an X-Forwarded-For header and dodge rate limits.
export function getTrustProxy(env = process.env) {
  const raw = env.TRUST_PROXY_HOPS?.trim();

  if (!raw) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "Set TRUST_PROXY_HOPS in production (1 on Render, 0 if there is no proxy).",
      );
    }
    return false; // local development: trust no forwarded headers
  }

  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 3) {
    throw new Error("TRUST_PROXY_HOPS must be a whole number from 0 to 3.");
  }
  return hops === 0 ? false : hops;
}
