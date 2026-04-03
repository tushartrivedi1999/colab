import cors, { CorsOptions } from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import crypto from "node:crypto";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error.middleware";
import { notFoundHandler } from "./middleware/notFound.middleware";
import { enforceHttps, sanitizeRequestInput } from "./middleware/security.middleware";
import routes from "./routes";
import { logger } from "./utils/logger";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

const globalLimiter = rateLimit({
  windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,
  max: env.GLOBAL_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.endsWith("/health"),
  message: { message: "Too many requests. Please try again later." }
});

const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth requests, please try again later." }
});

const corsOptions: CorsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("CORS policy denied this origin"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
  credentials: true,
  maxAge: 86400
};

morgan.token("request-id", (req: express.Request) => (req as RequestWithId).requestId);

type RequestWithId = express.Request & { requestId?: string };

app.use((req: RequestWithId, res: express.Response, next: express.NextFunction) => {
  req.requestId = req.headers["x-request-id"]?.toString() || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:", "https://tile.openstreetmap.org", "https://*.mapbox.com"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
        "connect-src": ["'self'", "https://api.mapbox.com", "https://events.mapbox.com"],
        "worker-src": ["'self'", "blob:"],
        "frame-ancestors": ["'none'"]
      }
    },
    hsts: env.FORCE_HTTPS
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      : false
  })
);
app.use(enforceHttps);
app.use(cors(corsOptions));
app.use(globalLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use(hpp());
app.use(sanitizeRequestInput);
app.use(
  morgan(':method :url :status :response-time ms req_id=:request-id', {
    stream: {
      write: (line: string) => logger.info("http_request", { line: line.trim() })
    }
  })
);
app.use(`${env.API_PREFIX}/auth`, authLimiter);

app.use(env.API_PREFIX, routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
