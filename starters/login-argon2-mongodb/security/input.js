// shared username and email rules (also used by models/User.js).
import { EMAIL_PATTERN, USERNAME_PATTERN } from "../models/validators.js";

// Carry an intended HTTP status to the error handler in app.js.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* Inspect nested input without treating it as executable instructions
 or allowing it to become an arbitrary MongoDB query. */

export function assertSafeObject(value, depth = 0) {
  // Limit recursive inspection depth; body-size and traffic limits are separate.
  if (depth > 10) {
    throw new HttpError(400, "Request body is too deeply nested.");
  }
  // Primitives have no nested keys to inspect here.
  // Field-specific helpers must still validate their types and values.
  if (value === null || typeof value !== "object") {
    return;
  }

  for (const key of Object.keys(value)) {
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      ["__proto__", "constructor", "prototype"].includes(key)
    ) {
      throw new HttpError(400, "Request body contains an unsupported field.");
    }

    assertSafeObject(value[key], depth + 1);
  }
}

// Express middleware: inspect parsed JSON before routes use it.
export function rejectUnsafeJson(req, res, next) {
  // No parsed body means this middleware has no object to inspect.
  try {
    if (req.body !== undefined) {
      assertSafeObject(req.body);
    }
    next();
    // Validation errors below are forwarded to the application's error handler.
  } catch (error) {
    next(error);
  }
}

// The URL query string (?page=2&sort=new) is untrusted input too. Express 5's
// "simple" parser turns it into strings or arrays of strings, but a route
// could still be fooled, for example by
// ?email=a&email=b (an array) or by keys that look like Mongo operators.
// This global check rejects operator-like keys, too many parameters, and
// oversized values before any route sees them. Routes must STILL validate
// the specific parameters they use (type, allowed values, number ranges).
const MAX_QUERY_KEYS = 30;
const MAX_QUERY_VALUES_PER_KEY = 20;
const MAX_QUERY_VALUE_LENGTH = 2000;

export function rejectUnsafeQuery(req, res, next) {
  const query = req.query ?? {};
  const keys = Object.keys(query);
  const unsupported = () =>
    next(new HttpError(400, "Request contains an unsupported query parameter."));

  if (keys.length > MAX_QUERY_KEYS) return unsupported();

  for (const key of keys) {
    if (
      key.length > 100 ||
      key.startsWith("$") ||
      /[.[\]]/.test(key) ||
      ["__proto__", "constructor", "prototype"].includes(key)
    ) {
      return unsupported();
    }
    const values = Array.isArray(query[key]) ? query[key] : [query[key]];
    if (
      values.length > MAX_QUERY_VALUES_PER_KEY ||
      values.some(
        (value) => typeof value !== "string" || value.length > MAX_QUERY_VALUE_LENGTH,
      )
    ) {
      return unsupported();
    }
  }
  next();
}

// Accept only a plain object containing allowed fields.
function fields(body, allowed) {
  if (
    !body ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    throw new HttpError(400, "Send a JSON object.");
  }

  // Reject unsafe key patterns; the allowlist below rejects unexpected fields.
  assertSafeObject(body);

  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, "Request body contains unsupported fields.");
  }
}

// Reusable text validation.
function string(value, label, min, max, trim = false) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} must be text.`);
  }

  const result = trim ? value.trim() : value;

  if (result.length < min || result.length > max) {
    throw new HttpError(
      400,
      `${label} must be between ${min} and ${max} characters.`,
    );
  }
  return result;
}
// readEmail function: validate and normalize an email address.
export function readEmail(value) {
  const email = string(value, "Email", 3, 254, true).toLowerCase();

  // Basic format validation does not prove email ownership.
  // EMAIL_PATTERN also refuses control and invisible characters.
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(
      400,
      "Email format is invalid. Enter a valid email address.",
    );
  }
  return email;
}

// Validate a new password's type and length without changing its contents.
export function readNewPassword(value) {
  // Do not trim or silently truncate passwords.
  return string(value, "Password", 15, 128);
}

// Names nobody can register, so no visitor can pose as site staff. Comparison
// ignores capital letters and the separators "_", ".", and "-", so "Ad_Min"
// counts as "admin". Add your own names in the RESERVED_USERNAMES setting:
//   RESERVED_USERNAMES=yourname,yourbrand
// Reserved names only block NEW registrations; existing accounts keep theirs.
const RESERVED_USERNAMES = [
  "admin", "administrator", "root", "system", "support", "moderator", "mod",
  "staff", "owner", "official", "security", "help", "api", "null",
  "undefined",
];

export function isReservedUsername(
  username,
  extra = process.env.RESERVED_USERNAMES,
) {
  const squash = (name) => name.trim().toLowerCase().replace(/[_.-]/g, "");
  const reserved = new Set(
    [...RESERVED_USERNAMES, ...String(extra ?? "").split(",")]
      .map(squash)
      .filter(Boolean),
  );
  return reserved.has(squash(username));
}

// Validate registration fields and return only accepted values.
export function parseRegistration(body) {
  fields(body, ["username", "email", "password"]);

  const username = string(body.username, "Username", 3, 35, true);

  if (/[\u0000-\u001f\u007f]/.test(username)) {
    throw new HttpError(400, "Username contains an unsupported character.");
  }

  // letters, digits, "_", "-", and "." only, starting and ending
  // with a letter or digit. This blocks look-alike Unicode names.
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(
      400,
      "Usernames may use letters, numbers, _, -, and . and must start and end with a letter or number.",
    );
  }

  // staff-like names are not available to the public.
  if (isReservedUsername(username)) {
    throw new HttpError(409, "That username is not available.");
  }
  // Return the validated username, normalized email, and unchanged password.
  return {
    username,
    email: readEmail(body.email),
    password: readNewPassword(body.password),
  };
}

// Validate login fields; normalize email but preserve the password.
export function parseLogin(body) {
  fields(body, ["email", "password"]);

  return {
    email: readEmail(body.email),

    // The new-password minimum does not apply to a login attempt.
    password: string(body.password, "Password", 1, 128),
  };
}

// Validate the email supplied when requesting password-recovery instructions.
export function parseRecovery(body) {
  fields(body, ["email"]);

  return {
    email: readEmail(body.email),
  };
}

// Check token format only; the service checks expiry and single use.
export function readResetToken(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new HttpError(400, "Reset link is invalid or expired.");
  }
  return value;
}

// Validate the reset token and new password; this request does not take an email.
export function parseReset(body) {
  fields(body, ["token", "newPassword"]);

  return {
    token: readResetToken(body.token),
    newPassword: readNewPassword(body.newPassword),
  };
}

// YOUR FIELDS GO HERE: validate exactly what your own records accept.
export function parseItem(body) {
  fields(body, ["title", "description"]);

  return {
    title: string(body.title, "Title", 1, 255, true),
    description: string(body.description ?? "", "Description", 0, 10000, true),
  };
}

// Return only intentionally public account information.
export function publicUser(user) {
  // Exclude password hashes and internal session-version information.
  return {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
  };
}
