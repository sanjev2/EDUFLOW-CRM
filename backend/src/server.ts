import { app } from "./app.js";
import { config, configurationSource } from "./config.js";
import { connectDatabase, disconnectDatabase } from "./database.js";
import { logger } from "./logger.js";
import { migrateApplicationSchema } from "./crm/migration.js";

async function start() {
  await connectDatabase();
  await migrateApplicationSchema();
  logger.info({
    configurationSource,
    emailDeliveryMode: config.EMAIL_DELIVERY_MODE,
  }, "EduFlow configuration validated");
  const server = app.listen(config.BACKEND_PORT, () => logger.info({ port: config.BACKEND_PORT }, "EduFlow API listening"));
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");
    server.close(() => {
      void disconnectDatabase().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, "API startup failed");
  process.exit(1);
});
