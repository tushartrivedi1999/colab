import { Pool } from "pg";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL_ENABLED
    ? {
        rejectUnauthorized: env.NODE_ENV === "production"
      }
    : false,
  statement_timeout: 10000,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000
});

db.on("error", (error) => {
  logger.error("database_pool_error", { error: error.message });
});
