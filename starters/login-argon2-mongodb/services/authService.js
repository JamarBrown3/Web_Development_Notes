import { createHash, randomBytes } from "node:crypto";
import User from "../models/User.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import {
  HttpError,
  parseRegistration,
  parseLogin,
  parseRecovery,
  parseReset,
} from "../security/input.js";
import {
  hashNewPassword,
  needsRehash,
  verifyPassword,
} from "../security/passwords.js";
import { trusted } from "../config/mongooseSecurity.js";
import { USERNAME_COLLATION } from "../models/validators.js";

export const RESET_LIFETIME_MS = 15 * 60 * 1000;

// Limits on reset emails, checked against saved records so they survive a
// restart. Requests over the limit are skipped silently, and the person still
// sees the same "If an account exists..." message.
export const RESET_EMAILS_PER_HOUR = 3;
export const RESET_EMAIL_MIN_GAP_MS = 60 * 1000;

// Reset tokens are long and random, unlike human passwords, so a fast digest
// is safe here. Store the digest, never the usable token.
export const tokenDigest = (token) =>
  createHash("sha256").update(token).digest("hex");

export function createAuthService({
  UserModel = User,
  TokenModel = PasswordResetToken,
  connection = UserModel.db,
  deliverResetEmail = null,
  resetOrigin = "http://localhost:5173",
  resetEmailsPerHour = RESET_EMAILS_PER_HOUR,
  resetEmailMinGapMs = RESET_EMAIL_MIN_GAP_MS,
} = {}) {
  // Build reset links from this setting, never from a client's Host header.
  const origin = new URL(resetOrigin);

  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Configure a trusted frontend origin for password recovery.");
  }

  // REGISTER: validate, hash, then save only the allowed fields.
  async function register(body) {
    const { username, email, password } = parseRegistration(body);

    // Usernames are public, so it is safe to say when one is taken. This runs
    // before anything involving the email, so the answer never depends on it.
    const usernameTaken = await UserModel.exists({ username }).collation(
      USERNAME_COLLATION,
    );
    if (usernameTaken) {
      throw new HttpError(409, "That username is not available.");
    }

    const passwordHash = await hashNewPassword(password);

    try {
      await UserModel.create({
        username,
        email,
        passwordHash,
        role: "user",
        status: "active",
        sessionVersion: 0,
      });
    } catch (error) {
      // A duplicate email gets the same public response as a new account.
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  // LOGIN: validate input and check the stored password hash.
  async function authenticate(body) {
    const { email, password } = parseLogin(body);

    // passwordHash is hidden by the schema, so this asks for it by name.
    const user = await UserModel.findOne({ email }).select("+passwordHash");

    const matches = await verifyPassword(password, user?.passwordHash);

    if (
      !matches ||
      !user ||
      user.status !== "active" ||
      !Number.isSafeInteger(user.sessionVersion)
    ) {
      throw new HttpError(401, "Invalid credentials.");
    }

    // Quietly upgrade an older hash now that the password is known to be
    // correct. A failure here must never block a valid sign-in.
    if (needsRehash(user.passwordHash)) {
      try {
        const upgraded = await hashNewPassword(password);
        await UserModel.updateOne(
          { _id: user._id, passwordHash: user.passwordHash },
          { $set: { passwordHash: upgraded } },
        );
      } catch {
        // Keep the old, still valid hash. The next sign-in will try again.
      }
    }

    return user;
  }

  // REQUEST RESET: create a temporary token and deliver its link.
  async function requestReset(body) {
    const { email } = parseRecovery(body);

    if (!deliverResetEmail) {
      throw new HttpError(503, "Password recovery is not configured yet.");
    }

    // email is hidden from normal queries, so this asks for it by name.
    const user = await UserModel.findOne({
      email,
      status: "active",
    }).select("+email");

    if (!user) {
      return;
    }

    const now = Date.now();
    const recent = await TokenModel.find({
      userId: user._id,
      createdAt: trusted({ $gt: new Date(now - 60 * 60 * 1000) }),
    })
      .select("createdAt")
      .lean();
    const tooMany = recent.length >= resetEmailsPerHour;
    const tooSoon = recent.some(
      (record) => now - new Date(record.createdAt).getTime() < resetEmailMinGapMs,
    );
    if (tooMany || tooSoon) {
      return;
    }

    const rawToken = randomBytes(32).toString("hex");

    const record = await TokenModel.create({
      userId: user._id,
      sessionVersion: user.sessionVersion,
      tokenHash: tokenDigest(rawToken),
      expiresAt: new Date(Date.now() + RESET_LIFETIME_MS),
    });

    // The token goes after "#", which browsers never send to any server, so it
    // stays out of access logs and Referer headers. Your reset page reads it with:
    //   new URLSearchParams(window.location.hash.slice(1)).get("token")
    const resetUrl = new URL("/reset-password", origin);
    resetUrl.hash = new URLSearchParams({ token: rawToken }).toString();

    try {
      // Never return or log this URL.
      await deliverResetEmail({
        to: user.email,
        resetUrl: resetUrl.toString(),
      });
    } catch {
      await TokenModel.deleteOne({ _id: record._id });

      throw new HttpError(503, "Password recovery is temporarily unavailable.");
    }
  }

  // RESET PASSWORD: use up the token and change the password together.
  async function resetPassword(body) {
    const { token, newPassword } = parseReset(body);

    if (!deliverResetEmail) {
      throw new HttpError(503, "Password recovery is not configured yet.");
    }

    const tokenHash = tokenDigest(token);

    // Check the link before the expensive hash, so a bot cannot burn CPU with
    // random tokens. The transaction below still re-checks everything.
    const looksValid = await TokenModel.exists({
      tokenHash,
      usedAt: null,
      expiresAt: trusted({ $gt: new Date() }),
    });
    if (!looksValid) {
      throw new HttpError(400, "Reset link is invalid or expired.");
    }

    const passwordHash = await hashNewPassword(newPassword);

    const session = await connection.startSession();

    try {
      await session.withTransaction(async () => {
        const now = new Date();

        const record = await TokenModel.findOneAndUpdate(
          {
            tokenHash,
            usedAt: null,
            expiresAt: trusted({ $gt: now }),
          },
          {
            $set: { usedAt: now },
          },
          {
            session,
            returnDocument: "after",
            runValidators: true,
          },
        );

        if (
          !record ||
          !Number.isSafeInteger(record.sessionVersion) ||
          record.sessionVersion < 0 ||
          record.sessionVersion >= Number.MAX_SAFE_INTEGER
        ) {
          throw new HttpError(400, "Reset link is invalid or expired.");
        }

        // Raising the version signs this account out everywhere.
        const result = await UserModel.updateOne(
          {
            _id: record.userId,
            status: "active",
            sessionVersion: record.sessionVersion,
          },
          {
            $set: { passwordHash },
            $inc: { sessionVersion: 1 },
          },
          {
            session,
            runValidators: true,
          },
        );

        if (result.matchedCount !== 1) {
          throw new HttpError(400, "Reset link is invalid or expired.");
        }

        // Cancel every other reset link for this account.
        await TokenModel.deleteMany({ userId: record.userId }, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  return {
    register,
    authenticate,
    requestReset,
    resetPassword,
    recoveryEnabled: Boolean(deliverResetEmail),
    UserModel,
  };
}
