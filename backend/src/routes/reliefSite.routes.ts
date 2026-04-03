import { Router } from "express";
import { createReliefSite, getNearbyReliefSites } from "../controllers/reliefSite.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/", getNearbyReliefSites);
router.post("/", requireAuth, createReliefSite);

export default router;
