import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().default("/api/v1"),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("1d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  EMAIL_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  FORCE_HTTPS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

const parsed = envSchema.parse(process.env);

const corsOrigins = parsed.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (parsed.NODE_ENV === "production" && corsOrigins.some((origin) => origin.includes("localhost"))) {
  throw new Error("CORS_ORIGIN must not include localhost in production");
}

if (parsed.NODE_ENV === "production" && !parsed.FORCE_HTTPS) {
  throw new Error("FORCE_HTTPS=true is required in production");
}

export const env = {
  ...parsed,
  CORS_ORIGINS: corsOrigins
};
