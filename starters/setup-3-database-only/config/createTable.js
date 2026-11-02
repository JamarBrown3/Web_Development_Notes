import { pool } from "./database.js";

// IF NOT EXISTS means this never deletes rows, so it is safe to run again.
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

try {
  await pool.query(createTableQuery);
  console.log("🎉 Items table is ready.");
} catch (error) {
  console.error("⚠️ Could not create the table:", error.code || error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
