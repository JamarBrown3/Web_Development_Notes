// Shared test tools. Tests run with NODE_ENV=test, so config/env.js never reads
// .env and these files can never reach your real database or real secrets.
import { once } from "node:events";
import session from "express-session";
import User from "../models/User.js";
import { createApp } from "../app.js";
import { createAuth } from "../security/auth.js";
import { createAuthService } from "../services/authService.js";

export const password = "a long test password with spaces";
export const secret = "test-only-signing-secret-never-use-this-in-production-0123456789";

export async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// Stands in for the login counter collection in MongoDB.
export function counterCollection() {
  const records = new Map();
  return {
    records,
    async createIndex() {},
    async findOneAndUpdate(filter, update) {
      const old = records.get(filter._id);
      const record = old || { _id: filter._id, ...update.$setOnInsert, count: 0 };
      record.count += update.$inc.count;
      records.set(filter._id, record);
      return { ...record };
    },
  };
}

// Stands in for the User model, while still running the real schema rules.
export function userRepository() {
  const users = new Map();
  let reads = 0;
  return {
    users,
    reads: () => reads,
    async create(data) {
      const user = new User(data);
      await user.validate();
      const duplicate = [...users.values()].some(
        (old) => old.email === user.email || old.username === user.username,
      );
      if (duplicate) throw Object.assign(new Error("duplicate fixture"), { code: 11000 });
      users.set(user._id.toString(), user);
      return user;
    },
    findOne(filter) {
      reads += 1;
      if (typeof filter.email !== "string") throw new Error("An operator object reached the database.");
      const user = [...users.values()].find((value) => value.email === filter.email) || null;
      return { select: async () => user };
    },
    async findById(id) {
      reads += 1;
      return users.get(String(id)) || null;
    },
    exists(filter) {
      reads += 1;
      if (typeof filter.username !== "string") throw new Error("An operator object reached the database.");
      const hit = [...users.values()].find(
        (value) => value.username.toLowerCase() === filter.username.toLowerCase(),
      );
      return { collation: async () => (hit ? { _id: hit._id } : null) };
    },
    async updateOne(filter, update) {
      const user = users.get(String(filter._id));
      if (!user) return { matchedCount: 0 };
      Object.assign(user, update.$set);
      return { matchedCount: 1 };
    },
  };
}

// A tiny browser stand-in that keeps its cookie and CSRF token like a real tab.
export function browser(base) {
  let cookie = "";
  let csrfToken = "";
  return async (path, { method = "GET", body, token, headers = {} } = {}) => {
    const selected = token === undefined ? csrfToken : token;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(selected ? { "X-CSRF-Token": selected } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let data = null;
    try {
      data = await response.json();
    } catch {
      // Some responses have no body.
    }
    if (data?.csrfToken) csrfToken = data.csrfToken;
    return { status: response.status, headers: response.headers, data, cookie, setCookie };
  };
}

// Boots the full app with fake storage, so no database is needed.
export async function fixture(
  run,
  { max = 1000, limit = 20, collection = counterCollection(), mountRoutes, trustProxy = false } = {},
) {
  const repository = userRepository();
  const service = createAuthService({ UserModel: repository, connection: {} });
  const store = new session.MemoryStore();
  const auth = createAuth({
    service,
    store,
    secret,
    production: false,
    rateLimitMax: max,
    accountLoginLimit: limit,
    loginAccountCollection: collection,
  });
  const app = createApp({
    auth,
    trustProxy,
    globalRateLimitMax: 1000,
    checkDatabase: async () => true,
    mountRoutes,
  });
  const { base, close } = await listen(app);
  try {
    await run({ request: browser(base), browser: () => browser(base), base, repository, service, auth, store });
  } finally {
    await close();
  }
}
