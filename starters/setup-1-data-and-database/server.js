import "dotenv/config";
import express from "express";
import itemsRouter from "./routes/items.js";
import { HttpError } from "./utils/HttpError.js";

const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/items", itemsRouter);

// No route above matched.
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Express knows this is the error handler because it has four parameters.
app.use((error, req, res, next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  // express.json() could not read the request body.
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }

  console.error(error);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
