// Shared format rules used by BOTH the Mongoose models and the HTTP input
// parsers in security/input.js. Keeping one copy means the database and the
// API can never disagree about what a valid username or email is.

// Usernames are public.
// Only plain letters, digits, underscore, hyphen, and period are allowed, and
// the first and last characters must be a letter or digit. This blocks
// look-alike Unicode names (for example a Cyrillic "а" posing as "a"),
// invisible characters, and names that are only punctuation.
export const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/;

// Case-insensitive comparison rule for usernames. "Sam", "sam",
// and "SAM" are treated as the same name by the unique database index.
export const USERNAME_COLLATION = Object.freeze({ locale: "en", strength: 2 });

// Basic email shape check. \s blocks spaces and line breaks
// (which also stops email-header injection), \p{Cc} blocks control
// characters, and \p{Cf} blocks invisible formatting characters such as
// zero-width spaces. A format check still does NOT prove mailbox ownership.
export const EMAIL_PATTERN =
  /^[^\s@\p{Cc}\p{Cf}]+@[^\s@\p{Cc}\p{Cf}]+\.[^\s@\p{Cc}\p{Cf}]+$/u;
