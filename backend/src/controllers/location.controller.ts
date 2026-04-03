import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { AuthedRequest } from "../middleware/auth.middleware";

const createLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  type: z.enum(["water", "ors", "shade"]),
  description: z.string().min(10).max(500)
});

const querySchema = z.object({
  type: z.enum(["water", "ors", "shade"]).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  minLng: z.coerce.number().optional(),
  minLat: z.coerce.number().optional(),
  maxLng: z.coerce.number().optional(),
  maxLat: z.coerce.number().optional()
});

const reviewSchema = z.object({
  note: z.string().max(300).optional()
});
const idParamSchema = z.object({
  id: z.string().uuid()
});

const aggregationSchema = z.object({
  period: z.enum(["daily", "weekly"]).default("daily")
});

export const createLocationProposal = async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = createLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const { lat, lng, type, description } = parsed.data;

  const result = await db.query(
    `INSERT INTO locations (type, description, location, provider_id, status)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, 'pending')
     RETURNING id, type, description, status, created_at`,
    [type, description, lng, lat, req.user?.id]
  );

  res.status(201).json({ proposal: result.rows[0] });
};

export const getLocations = async (req: Request, res: Response): Promise<void> => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query params", issues: parsed.error.issues });
    return;
  }

  const { type, status, minLng, minLat, maxLng, maxLat } = parsed.data;
  const where: string[] = [];
  const values: unknown[] = [];

  if (type) {
    values.push(type);
    where.push(`l.type = $${values.length}`);
  }

  if (status) {
    values.push(status);
    where.push(`l.status = $${values.length}`);
  }

  if (
    minLng !== undefined &&
    minLat !== undefined &&
    maxLng !== undefined &&
    maxLat !== undefined
  ) {
    values.push(minLng, minLat, maxLng, maxLat);
    where.push(
      `l.location::geometry && ST_MakeEnvelope($${values.length - 3}, $${values.length - 2}, $${values.length - 1}, $${values.length}, 4326)`
    );
  }

  const query = `
    SELECT l.id, l.type, l.description, l.status,
      ST_X(l.location::geometry) AS lng,
      ST_Y(l.location::geometry) AS lat,
      l.provider_id,
      l.reviewed_by,
      l.review_note,
      l.created_at,
      l.reviewed_at,
      COALESCE(usage_stats.total_count, 0) AS usage_count,
      usage_stats.last_increment_at
    FROM locations l
    LEFT JOIN (
      SELECT location_id, COUNT(*)::INT AS total_count, MAX(created_at) AS last_increment_at
      FROM location_usage_events
      GROUP BY location_id
    ) usage_stats ON usage_stats.location_id = l.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY l.created_at DESC
    LIMIT 500
  `;

  const result = await db.query(query, values);

  res.json({ count: result.rowCount, locations: result.rows });
};

const updateStatus = async (
  req: AuthedRequest,
  res: Response,
  status: "approved" | "rejected"
): Promise<void> => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ message: "Invalid location id" });
    return;
  }

  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const result = await db.query(
    `UPDATE locations
     SET status = $1,
         reviewed_by = $2,
         reviewed_at = now(),
         review_note = $3
     WHERE id = $4
     RETURNING id, status, reviewed_by, reviewed_at, review_note`,
    [status, req.user?.id, parsed.data.note ?? null, parsedId.data.id]
  );

  if (!result.rowCount) {
    res.status(404).json({ message: "Location proposal not found" });
    return;
  }

  res.json({ location: result.rows[0] });
};

export const approveLocationProposal = async (req: AuthedRequest, res: Response): Promise<void> => {
  await updateStatus(req, res, "approved");
};

export const rejectLocationProposal = async (req: AuthedRequest, res: Response): Promise<void> => {
  await updateStatus(req, res, "rejected");
};

const incrementUsage = async (
  req: Request,
  res: Response,
  source: "manual" | "qr"
): Promise<void> => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ message: "Invalid location id" });
    return;
  }

  const locationId = parsedId.data.id;

  const exists = await db.query("SELECT id FROM locations WHERE id = $1", [locationId]);
  if (!exists.rowCount) {
    res.status(404).json({ message: "Location not found" });
    return;
  }

  await db.query(
    "INSERT INTO location_usage_events (location_id, source) VALUES ($1, $2)",
    [locationId, source]
  );

  const countResult = await db.query(
    "SELECT COUNT(*)::INT AS usage_count, MAX(created_at) AS last_increment_at FROM location_usage_events WHERE location_id = $1",
    [locationId]
  );

  res.status(201).json({
    locationId,
    usageCount: countResult.rows[0].usage_count,
    lastIncrementAt: countResult.rows[0].last_increment_at
  });
};

export const incrementLocationUsage = async (req: Request, res: Response): Promise<void> => {
  await incrementUsage(req, res, "manual");
};

export const incrementLocationUsageQr = async (req: Request, res: Response): Promise<void> => {
  await incrementUsage(req, res, "qr");
};

export const getLocationUsageAggregation = async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = aggregationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query params", issues: parsed.error.issues });
    return;
  }

  const { period } = parsed.data;
  const bucketExpr = period === "daily" ? "date_trunc('day', lue.created_at)" : "date_trunc('week', lue.created_at)";

  const byLocation = await db.query(
    `SELECT l.id AS location_id,
            l.type,
            l.status,
            COUNT(lue.id)::INT AS total_usage,
            COUNT(*) FILTER (WHERE lue.created_at >= now() - INTERVAL '1 day')::INT AS last_24h_usage,
            COUNT(*) FILTER (WHERE lue.created_at >= now() - INTERVAL '7 days')::INT AS last_7d_usage
     FROM locations l
     LEFT JOIN location_usage_events lue ON lue.location_id = l.id
     GROUP BY l.id
     ORDER BY total_usage DESC, l.created_at DESC`
  );

  const timeline = await db.query(
    `SELECT ${bucketExpr} AS bucket_start,
            COUNT(*)::INT AS usage_count
     FROM location_usage_events lue
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 60`
  );

  res.json({
    period,
    byLocation: byLocation.rows,
    timeline: timeline.rows
  });
};
