import { Router } from "express";
import { login, register } from "../controllers/auth.controller";
import { getProfile } from "../controllers/profile.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/profile", requireAuth, getProfile);

export default router;
