import { Request, Response } from "express";
import { z } from "zod";
import XLSX from "xlsx";
import { db } from "../db/pool";
import { decryptEmail } from "../services/crypto.service";

const dashboardQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  type: z.enum(["water", "ors", "shade"]).optional()
});

const roleUpdateSchema = z.object({
  role: z.enum(["admin", "sub-admin", "provider"])
});
const idParamSchema = z.object({
  id: z.string().uuid()
});

const exportQuerySchema = z.object({
  format: z.enum(["csv", "xls"]).default("csv")
});

export const getDashboardData = async (req: Request, res: Response): Promise<void> => {
  const parsed = dashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query params", issues: parsed.error.issues });
    return;
  }

  const where: string[] = [];
  const values: unknown[] = [];

  if (parsed.data.status) {
    values.push(parsed.data.status);
    where.push(`l.status = $${values.length}`);
  }

  if (parsed.data.type) {
    values.push(parsed.data.type);
    where.push(`l.type = $${values.length}`);
  }

  const locationsResult = await db.query(
    `SELECT l.id, l.type, l.status, l.description,
            ST_X(l.location::geometry) AS lng,
            ST_Y(l.location::geometry) AS lat,
            COALESCE(usage_stats.total_usage, 0)::INT AS usage_count
     FROM locations l
     LEFT JOIN (
       SELECT location_id, COUNT(*) AS total_usage
       FROM location_usage_events
       GROUP BY location_id
     ) usage_stats ON usage_stats.location_id = l.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY l.created_at DESC`,
    values
  );

  const usersServed = await db.query(
    `SELECT date_trunc('day', created_at) AS bucket,
            COUNT(*)::INT AS users_served
     FROM location_usage_events
     GROUP BY 1
     ORDER BY 1 ASC
     LIMIT 60`
  );

  const locationsByType = await db.query(
    `SELECT type, COUNT(*)::INT AS location_count
     FROM locations
     GROUP BY type
     ORDER BY location_count DESC`
  );

  res.json({
    filters: parsed.data,
    locations: locationsResult.rows,
    usersServed: usersServed.rows,
    locationsByType: locationsByType.rows
  });
};

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const usersResult = await db.query(
    "SELECT id, email_encrypted, role, created_at FROM users ORDER BY created_at DESC LIMIT 500"
  );

  const users = usersResult.rows.map((user) => ({
    id: user.id,
    email: decryptEmail(user.email_encrypted),
    role: user.role,
    createdAt: user.created_at
  }));

  res.json({ count: users.length, users });
};

export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ message: "Invalid user id" });
    return;
  }

  const parsed = roleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const result = await db.query(
    "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, role, created_at",
    [parsed.data.role, parsedParams.data.id]
  );

  if (!result.rowCount) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({ user: result.rows[0] });
};

export const exportDashboardData = async (req: Request, res: Response): Promise<void> => {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query params", issues: parsed.error.issues });
    return;
  }

  const result = await db.query(
    `SELECT l.id,
            l.type,
            l.status,
            l.description,
            ST_X(l.location::geometry) AS lng,
            ST_Y(l.location::geometry) AS lat,
            COALESCE(usage_stats.total_usage, 0)::INT AS usage_count,
            l.created_at
     FROM locations l
     LEFT JOIN (
       SELECT location_id, COUNT(*) AS total_usage
       FROM location_usage_events
       GROUP BY location_id
     ) usage_stats ON usage_stats.location_id = l.id
     ORDER BY l.created_at DESC`
  );

  const rows = result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    usage_count: row.usage_count,
    created_at: row.created_at
  }));

  if (parsed.data.format === "csv") {
    const header = "id,type,status,description,lat,lng,usage_count,created_at";
    const lines = rows.map((row) =>
      [
        row.id,
        row.type,
        row.status,
        JSON.stringify(row.description ?? ""),
        row.lat,
        row.lng,
        row.usage_count,
        new Date(row.created_at).toISOString()
      ].join(",")
    );

    const csv = [header, ...lines].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=dashboard-export.csv");
    res.send(csv);
    return;
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Locations");

  const file = XLSX.write(workbook, { type: "buffer", bookType: "xls" });
  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", "attachment; filename=dashboard-export.xls");
  res.send(file);
};
