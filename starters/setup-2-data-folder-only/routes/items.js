import express from "express";
import ItemsController from "../controllers/items.js";

const router = express.Router();

router.get("/", ItemsController.getItems);
router.get("/:id", ItemsController.getItemById);
router.post("/", ItemsController.createItem);
router.patch("/:id", ItemsController.updateItem);
router.delete("/:id", ItemsController.deleteItem);

export default router;
