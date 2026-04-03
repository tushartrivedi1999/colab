import { env } from "../config/env";

type LogLevel = "debug" | "info" | "warn" | "error";

const severityOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const canLog = (level: LogLevel): boolean => {
  const configuredLevel = (env.LOG_LEVEL as LogLevel) || "info";
  return severityOrder[level] >= severityOrder[configuredLevel];
};

const writeLog = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
  if (!canLog(level)) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
};

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => writeLog("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => writeLog("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => writeLog("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => writeLog("error", message, meta)
};
