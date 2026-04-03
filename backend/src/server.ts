import app from "./app";
import { env } from "./config/env";
import { db } from "./db/pool";
import { logger } from "./utils/logger";

const bootstrap = async (): Promise<void> => {
  await db.query("SELECT 1");

  app.listen(env.PORT, () => {
    logger.info("server_started", {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      httpsEnforced: env.FORCE_HTTPS
    });
  });
};

bootstrap().catch((error: Error) => {
  logger.error("server_bootstrap_failed", { error: error.message, stack: error.stack });
  process.exit(1);
});
