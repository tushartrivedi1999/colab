import { Router } from "express";
import adminRoutes from "./admin.routes";
import authRoutes from "./auth.routes";
import locationRoutes from "./location.routes";
import reliefSiteRoutes from "./reliefSite.routes";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/locations", locationRoutes);
router.use("/relief-sites", reliefSiteRoutes);

export default router;
