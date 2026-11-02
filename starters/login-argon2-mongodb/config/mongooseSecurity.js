// database-wide safety settings for Mongoose.
//
// Every model file imports this module BEFORE it creates its schema, so these
// rules apply to every model automatically, including ones you add later.
// When you create a new model, add this import at the top of the file:
//
//   import "../config/mongooseSecurity.js";

import mongoose from "mongoose";

// --- 1. Neutralize query-operator injection --------------------------------
// With sanitizeFilter on, if a value inside a query filter is an object that
// contains "$" keys (for example { email: { $ne: null } } built from untrusted
// input), Mongoose wraps it in { $eq: ... }. The query then looks for that
// literal object instead of running the operator, so it matches nothing or
// throws a CastError. It also refuses $where, $expr, $jsonSchema, and $text
// at the top of a filter.
//
// This is a SAFETY NET behind the HTTP input checks, not a replacement for them.
//
// IMPORTANT FOR FUTURE ROUTES: when YOUR server code needs an operator,
// mark that piece of the filter as trusted:
//
//   import { trusted } from "../config/mongooseSecurity.js";
//   Post.find({ rating: trusted({ $gte: minimumRating }) });
//
// Aggregation pipelines (Model.aggregate) are NOT sanitized. Build $match
// stages only from values you have already validated.
mongoose.set("sanitizeFilter", true);

export const trusted = mongoose.trusted;

// --- 2. Stop runaway queries from tying up the database ---------------------
// A slow query (for example a future search box using a regex) can be fired
// repeatedly by a bot to overload the database. maxTimeMS tells MongoDB to
// cancel any read that runs longer than this. A route can still set its own
// limit with .maxTimeMS(ms) when it genuinely needs longer.
export const DEFAULT_QUERY_TIME_LIMIT_MS = 5000;
export const DEFAULT_AGGREGATE_TIME_LIMIT_MS = 15000;

const READ_QUERIES = [
  "find",
  "findOne",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
];

function queryTimeLimitPlugin(schema) {
  schema.pre(READ_QUERIES, function applyQueryTimeLimit() {
    if (this.getOptions().maxTimeMS == null) {
      this.maxTimeMS(DEFAULT_QUERY_TIME_LIMIT_MS);
    }
  });

  schema.pre("aggregate", function applyAggregateTimeLimit() {
    if (this.options?.maxTimeMS == null) {
      this.option({ maxTimeMS: DEFAULT_AGGREGATE_TIME_LIMIT_MS });
    }
  });
}

// Register once per process, even if many model files import this module.
if (!mongoose.__queryTimeLimitPlugin) {
  mongoose.plugin(queryTimeLimitPlugin);
  Object.defineProperty(mongoose, "__queryTimeLimitPlugin", { value: true });
}
