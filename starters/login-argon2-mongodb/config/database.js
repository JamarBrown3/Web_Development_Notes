import mongoose from "mongoose";
import { getDatabaseConfig } from "./env.js";
import { assertApplicationRoles } from "../security/databaseAccess.js";

// Establish a connection and check its database permissions.
export async function connectDatabase() {
  const { uri, dbName } = getDatabaseConfig();

  // Wait for MongoDB before continuing application startup.
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000, // 10 seconds
    connectTimeoutMS: 10000, // 10 seconds
    socketTimeoutMS: 10000, // 10 seconds
    maxPoolSize: 10, // Limit the number of concurrent connections
  });

  // Ask MongoDB which roles this connection authenticated with.
  const status = await mongoose.connection.db
    .admin()
    .command({ connectionStatus: 1 });

  // Refuse a login with more access than this app needs.
  assertApplicationRoles(status.authInfo, dbName);
}

// Check that MongoDB can respond to a small command.
export async function pingDatabase() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Database is unavailable.");
  }

  // Ping the database to ensure it's responsive.
  const result = await mongoose.connection.db.command(
    { ping: 1 },
    { maxTimeMS: 3000 },
  );

  // If result is not ok then the database is not responding correctly.
  if (result.ok !== 1) {
    throw new Error("Database ping failed.");
  }
  return true;
}

// Close Mongoose connections when the process shuts down.
export async function disconnectDatabase() {
  await mongoose.disconnect();
}

// Translate database errors into messages that do not expose
// connection strings, credentials, or raw driver errors to the user.
export function explainDatabaseError(error) {
  if (error?.code === "EXCESS_DATABASE_PRIVILEGES") {
    return "Use a database account with only readWrite on this app's database. Broad administrator accounts are refused.";
  }

  // MongoDB authentication errors can be caused by incorrect credentials, expired passwords, or misconfigured database settings.
  if (error?.code === 18 || error?.codeName === "AuthenticationFailed") {
    return "MongoDB authentication failed. Check the database user's credentials locally.";
  }

  // The login worked, but this account may not run the operation.
  if (error?.code === 13 || error?.codeName === "Unauthorized") {
    return "MongoDB denied this operation. Check the database user's permissions.";
  }

  // The server could not be reached at all.
  if (error?.name === "MongooseServerSelectionError") {
    return "MongoDB is unreachable. Check Atlas status, your IP access list, DNS, and connection settings.";
  }

  // If the error is not recognized, return a generic message.
  if (!process.env.MONGODB_URI?.trim()) {
    return `MONGODB_URI is missing. Enter it privately in server/.env.`;
  }
  return "MongoDB connection failed. Check the database server, credentials, and connection settings.";
}
