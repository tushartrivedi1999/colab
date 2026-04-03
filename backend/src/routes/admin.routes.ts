import { Router } from "express";
import {
  exportDashboardData,
  getDashboardData,
  listUsers,
  updateUserRole
} from "../controllers/admin.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/dashboard", getDashboardData);
router.get("/export", exportDashboardData);
router.get("/users", listUsers);
router.put("/users/:id/role", updateUserRole);

export default router;
