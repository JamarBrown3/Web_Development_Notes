import mongoose from "mongoose";
// Database-wide safety settings. Every model imports this before its schema.
import "../config/mongooseSecurity.js";

// YOUR RECORDS GO HERE. This example belongs to one signed-in account, which is
// what ownerId is for. Rename it and change the fields for your project.
const itemSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "items",
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(document, result) {
        delete result._id;
        return result;
      },
    },
  },
);

itemSchema.index({ ownerId: 1, createdAt: 1 });

const Item = mongoose.model("Item", itemSchema);

export default Item;
