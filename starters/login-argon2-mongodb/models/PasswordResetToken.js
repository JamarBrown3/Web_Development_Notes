import mongoose from "mongoose";
// database-wide safety settings; must load before the schema below.
import "../config/mongooseSecurity.js";

const passwordResetTokenSchema = new mongoose.Schema(
  {
    // The account this password-reset request belongs to.
    // A reference does not automatically verify that the user exists.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Snapshot from the account when this request was issued. Old requests
    // cannot reset an account after another password change advances its version.
    sessionVersion: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: "Invalid session version." },
    },

    // Store ONLY the SHA-256 hash of a cryptographically random token.
    //
    // This schema does not generate or hash tokens. services/authService.js does.
    // Never store the original reset token or a password here.

    // Uniqueness prevents duplicate hashes, not multiple requests per account.
    // The recovery service invalidates other requests after a successful reset.
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
      match: /^[a-f0-9]{64}$/, // SHA-256 hash format validation
    },

    // The expiration date of the token. After this date, the token is no longer valid.
    expiresAt: {
      type: Date,
      required: true,
    },

    // The date and time when the token was used. If null, the token has not been used yet.
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },

    collection: "passwordResetTokens",
    toJSON: {
      transform(document, result) {
        delete result.tokenHash;
        delete result.__v;
        return result;
      },
    },
  },
);
// TTL means "time to live."
// expireAfterSeconds: 0 tells MongoDB to use the expiresAt date.
//
// Cleanup happens in the background, NOT immediately at expiration.
// The service MUST still reject tokens whose expiresAt has passed.

// Cleanup can take longer than 60 seconds. Never use deletion timing as the
// security check: the recovery service must check expiration atomically.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetToken = mongoose.model(
  "PasswordResetToken",
  passwordResetTokenSchema,
);

export default PasswordResetToken;
