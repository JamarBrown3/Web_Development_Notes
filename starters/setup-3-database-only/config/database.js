import "dotenv/config";
import pg from "pg";

const isLocal = ["localhost", "127.0.0.1"].includes(process.env.PGHOST);

export const pool = new pg.Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
