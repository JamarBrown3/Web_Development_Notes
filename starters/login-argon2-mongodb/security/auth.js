import { Router } from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import { rateLimit } from "express-rate-limit";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAuthService } from "../services/authService.js";
import { HttpError, publicUser, parseLogin, parseRecovery } from "./input.js";
import { createAccountLoginLimiter } from "./accountLoginLimit.js";

// server.js supplies the real MongoDB connection and service. Tests can supply
// isolated substitutes. Returns a router, session middleware, and access checks.
export function createAuth({
  connection,
  service = createAuthService(),
  store,
  secret = process.env.SESSION_SECRET,
  production = process.env.NODE_ENV === "production",
  clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173",
  sameSite = process.env.SESSION_SAME_SITE || "strict",
  rateLimitMax = 20,
  // Server-injected alternatives are for isolated tests, never request input.
  accountLoginLimiter,
  loginAccountCollection = connection?.db?.collection("loginAccountLimits"),
  accountLoginLimit = 20,
} = {}) {
  // SECTION 1: Check the settings. A bad production setting stops the server.

  // A missing key in development gets a temporary one, so restarting signs
  // everyone out. A missing key in production is rejected by the next check.
  if (!secret && !production) {
    secret = randomBytes(32).toString("hex");
    console.warn(
      "Warning: Using a temporary session secret. Restarting the server will invalidate all sessions.",
    );
  }

  // Length alone does not prove randomness, so generate this key securely.
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new Error("Set a strong SESSION_SECRET before deploying authentication.");
  }

  if (
    !["strict", "lax", "none"].includes(sameSite) ||
    (sameSite === "none" && !production)
  ) {
    throw new Error("Invalid sessions SameSite configuration.");
  }

  const allowedOrigin = new URL(clientOrigin).origin;

  if (production && !allowedOrigin.startsWith("https://")) {
    throw new Error("Production authentication requires a HTTPS frontend origin.");
  }

  if (!store && !connection) {
    throw new Error("Authentication requires a persistent session store.");
  }

  // SECTION 2: Sessions live in MongoDB and reuse the connected client.

  store ||= MongoStore.create({
    client: connection.getClient(),
    dbName: connection.name,
    collectionName: "sessions",
    ttl: 1800,
    touchAfter: 60,
  });

  // The "__Host-" prefix makes the browser enforce secure cookie settings.
  const name = production ? "__Host-app.sid" : "app.sid";

  const cookie = {
    httpOnly: true,
    secure: production,
    sameSite,
    path: "/",
    maxAge: 30 * 60 * 1000,
  };

  const sessionMiddleware = session({
    name,
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie,
  });

  const clearSessionCookie = (res) =>
    res.clearCookie(name, { httpOnly: true, secure: production, sameSite, path: "/" });

  const destroySession = (req) =>
    new Promise((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });

  const router = Router();

  // SECTION 3: Limit repeated requests.

  // Count known and unknown emails the same way, across every IP address.
  accountLoginLimiter ||= createAccountLoginLimiter({
    collection: loginAccountCollection,
    secret,
    limit: accountLoginLimit,
  });

  async function limitAccountLogin(req, res, next) {
    try {
      req.loginInput = parseLogin(req.body);
      const result = await accountLoginLimiter.consume(req.loginInput.email);
      if (!result.allowed) {
        res.set("Retry-After", String(result.retryAfter));
        throw new HttpError(429, "Too many attempts. Please try again later.");
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  const tooMany = { error: "Too many attempts. Please try again later." };

  // Per-IP limits slow abuse, but they do not stop every bot. Each endpoint
  // gets its own counter.
  const makeLimit = () =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: rateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: tooMany,
    });

  const loginLimit = makeLimit();
  const registerLimit = makeLimit();
  const resetLimit = makeLimit();

  const csrfLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: tooMany,
  });

  const recoveryAccountLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    // Never use a raw email address as a counter key.
    keyGenerator: (req) => createHash("sha256").update(req.recoveryInput.email).digest("hex"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: tooMany,
  });

  // SECTION 4: Send recovery emails after responding, one at a time, so the
  // response time does not reveal whether an email is registered. This queue
  // lives in one Node process. A scaled deployment needs a durable worker.

  const recoveryQueue = [];
  let recoveryWorking = false;

  async function drainRecovery() {
    if (recoveryWorking) return;

    recoveryWorking = true;
    try {
      while (recoveryQueue.length) {
        const input = recoveryQueue.shift();
        try {
          await service.requestReset(input);
        } catch {
          console.warn("A queued password-recovery could not be completed.");
        }
      }
    } finally {
      recoveryWorking = false;
    }
  }

  // SECTION 5: Protect every authentication response.

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    next();
  });

  // Reject a request from another site. Requests with no Origin header pass
  // here, because this check is not authentication.
  router.use((req, res, next) => {
    const origin = req.get("Origin");

    if (origin && origin !== allowedOrigin) {
      return next(new HttpError(403, "Request origin is not allowed."));
    }
    next();
  });

  // SECTION 6: CSRF tokens. A valid token does not prove the requester is human.

  function csrf(req, res, next) {
    const supplied = req.get("X-CSRF-Token");
    const expected = req.session?.csrfToken;

    if (
      typeof supplied !== "string" ||
      typeof expected !== "string" ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !/^[a-f0-9]{64}$/.test(expected) ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return next(new HttpError(403, "Refresh the form and try again."));
    }
    next();
  }

  // Protects every API change, even if a router forgets csrf. GET, HEAD, and
  // OPTIONS routes must stay read-only in your route code.
  function csrfForMutations(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("Origin");
    if (origin && origin !== allowedOrigin) {
      return next(new HttpError(403, "Request origin is not allowed."));
    }
    return csrf(req, res, next);
  }

  // SECTION 7: Check who is making the request.

  async function requireAuth(req, res, next) {
    try {
      const auth = req.session?.auth;
      if (
        !auth ||
        typeof auth.userId !== "string" ||
        !/^[a-f0-9]{24}$/.test(auth.userId) ||
        !Number.isSafeInteger(auth.sessionVersion) ||
        !Number.isFinite(auth.authenticatedAt) ||
        Date.now() - auth.authenticatedAt > 8 * 60 * 60 * 1000
      ) {
        throw new HttpError(401, "Please sign in.");
      }

      // Re-check the real account, never a role sent by the browser.
      const user = await service.UserModel.findById(auth.userId);
      if (
        !user ||
        user.status !== "active" ||
        user.sessionVersion !== auth.sessionVersion
      ) {
        await destroySession(req);
        clearSessionCookie(res);
        throw new HttpError(401, "Please sign in.");
      }

      req.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  // This exact session must have signed in as an admin, so changing a stored
  // role does not upgrade a session that is already open.
  async function requireAdmin(req, res, next) {
    return requireAuth(req, res, (error) => {
      if (error) return next(error);

      if (req.authUser.role !== "admin" || req.session.auth.roleAtLogin !== "admin") {
        return next(new HttpError(403, "Administrative access is required."));
      }
      next();
    });
  }

  // SECTION 8: Authentication routes.

  router.get("/csrf", csrfLimit, (req, res) => {
    req.session.csrfToken ||= randomBytes(32).toString("hex");

    res.json({ csrfToken: req.session.csrfToken });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: publicUser(req.authUser) });
  });

  // A 202 does not prove a new account was created, so a duplicate email
  // cannot be used to find out who has an account.
  router.post("/register", registerLimit, csrf, async (req, res) => {
    await service.register(req.body);

    res.status(202).json({
      message: "Registration request received. You can try signing in.",
    });
  });

  router.post("/login", loginLimit, csrf, limitAccountLogin, async (req, res) => {
    const user = await service.authenticate(req.loginInput);

    // Replace the pre-login session ID, which stops session fixation.
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });

    req.session.auth = {
      userId: user._id.toString(),
      sessionVersion: user.sessionVersion,
      authenticatedAt: Date.now(),
      roleAtLogin: user.role,
    };

    // The old session's CSRF token is no longer used.
    req.session.csrfToken = randomBytes(32).toString("hex");

    // Finish saving before the next request uses the session.
    await new Promise((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    res.json({ user: publicUser(user), csrfToken: req.session.csrfToken });
  });

  router.post("/logout", csrf, async (req, res) => {
    await destroySession(req);
    clearSessionCookie(res);

    res.json({ message: "Signed out." });
  });

  router.post(
    "/forgot-password",
    resetLimit,
    csrf,
    // Validate the body before the account-based limiter uses it.
    (req, res, next) => {
      try {
        req.recoveryInput = parseRecovery(req.body);
        next();
      } catch (error) {
        next(error);
      }
    },
    recoveryAccountLimit,
    (req, res) => {
      if (!service.recoveryEnabled) {
        throw new HttpError(503, "Password recovery is not configured yet.");
      }

      if (recoveryQueue.length >= 20) {
        throw new HttpError(429, tooMany.error);
      }
      recoveryQueue.push(req.recoveryInput);

      // Do not reveal whether this email belongs to an account.
      res.status(202).json({
        message: "If an account exists, a recovery email will be sent.",
      });

      setImmediate(() => {
        void drainRecovery();
      });
    },
  );

  router.post("/reset-password", resetLimit, csrf, async (req, res) => {
    await service.resetPassword(req.body);
    await destroySession(req);
    clearSessionCookie(res);

    res.json({ message: "Password changed. Please sign in again." });
  });

  // SECTION 9: Everything the rest of the app needs.
  return {
    router,
    sessionMiddleware,
    requireAuth,
    requireAdmin,
    csrf,
    csrfForMutations,
    ready: () => accountLoginLimiter.ready?.(),
    cookieOptions: { name, ...cookie },
  };
}
