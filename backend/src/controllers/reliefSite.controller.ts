import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { AuthedRequest } from "../middleware/auth.middleware";

const querySchema = z.object({
  lng: z.coerce.number(),
  lat: z.coerce.number(),
  radius: z.coerce.number().default(3000)
});

const createSchema = z.object({
  name: z.string().min(2),
  category: z.enum(["cooling_center", "hydration", "medical", "shade"]),
  lng: z.number(),
  lat: z.number(),
  address: z.string().optional(),
  openHours: z.string().optional()
});

export const getNearbyReliefSites = async (req: Request, res: Response): Promise<void> => {
  const parsed = querySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query params", issues: parsed.error.issues });
    return;
  }

  const { lng, lat, radius } = parsed.data;

  const result = await db.query(
    `SELECT id, name, category, address, open_hours,
      ST_X(location::geometry) as lng,
      ST_Y(location::geometry) as lat,
      ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
      FROM relief_sites
      WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      ORDER BY distance_m ASC`,
    [lng, lat, radius]
  );

  res.json({ count: result.rowCount, sites: result.rows });
};

export const createReliefSite = async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const { name, category, lng, lat, address, openHours } = parsed.data;

  const result = await db.query(
    `INSERT INTO relief_sites (name, category, address, open_hours, location, created_by)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7)
     RETURNING id, name, category, address, open_hours`,
    [name, category, address ?? null, openHours ?? null, lng, lat, req.user?.id ?? null]
  );

  res.status(201).json({ site: result.rows[0] });
};
