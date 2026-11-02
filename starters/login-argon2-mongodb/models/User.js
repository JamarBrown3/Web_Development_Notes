import mongoose from "mongoose";
// Database-wide safety settings. This must load before the schema below.
import "../config/mongooseSecurity.js";
import {
  EMAIL_PATTERN,
  USERNAME_COLLATION,
  USERNAME_PATTERN,
} from "./validators.js";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 35,
      // Letters, digits, "_", "-", "." only, which blocks look-alike Unicode.
      // Uniqueness comes from the case-insensitive index below.
      match: USERNAME_PATTERN,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      // A format check does not prove the person owns this mailbox.
      match: EMAIL_PATTERN,
      unique: true,
      // Hidden from ordinary queries, so res.json(user) or populate() can never
      // leak it. Trusted code asks for it with .select("+email").
      select: false,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    status: {
      type: String,
      enum: ["active", "banned"],
      default: "active",
    },

    // Raising this number signs the account out everywhere.
    sessionVersion: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Session version must be a nonnegative safe integer.",
      },
    },
  },
  {
    timestamps: true,
    collection: "users",
    toJSON: {
      transform(document, result) {
        delete result.passwordHash;
        delete result.sessionVersion;
        delete result.__v;
        delete result.email;
        return result;
      },
    },
  },
);

// Case-insensitive unique usernames, so "Sam" and "sam" cannot both exist.
userSchema.index(
  { username: 1 },
  {
    unique: true,
    name: "username_case_insensitive_unique",
    collation: USERNAME_COLLATION,
  },
);

const User = mongoose.model("User", userSchema);
export default User;
