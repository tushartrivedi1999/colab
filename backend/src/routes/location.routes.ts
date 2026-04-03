import { Router } from "express";
import {
  approveLocationProposal,
  createLocationProposal,
  getLocationUsageAggregation,
  getLocations,
  incrementLocationUsage,
  incrementLocationUsageQr,
  rejectLocationProposal
} from "../controllers/location.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, requireRole("provider", "sub-admin", "admin"), createLocationProposal);
router.get("/", getLocations);
router.post("/:id/increment", incrementLocationUsage);
router.post("/:id/increment/qr", incrementLocationUsageQr);
router.put("/:id/approve", requireAuth, requireRole("admin"), approveLocationProposal);
router.put("/:id/reject", requireAuth, requireRole("admin"), rejectLocationProposal);
router.get("/usage/aggregation", requireAuth, requireRole("admin"), getLocationUsageAggregation);

export default router;
