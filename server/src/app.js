import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { foodsRouter } from "./routes/foods.js";
import { ordersRouter } from "./routes/orders.js";
import { paymentQrsRouter } from "./routes/paymentQrs.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { userRouter } from "./routes/userData.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { optionalUser, requireUser } from "./middleware/optionalUser.js";
import { addPublicSseClient } from "./realtime/publicSse.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : 0);

  app.use(
    helmet({
      // API-only server; keep defaults, but don't enforce CSP here.
      contentSecurityPolicy: false,
    }),
  );

  const allowedOrigins = String(process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const corsOptions = {
    origin: (origin, cb) => {
      // Allow non-browser clients (curl/postman) with no Origin header.
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0)
        return cb(new Error("CORS origin not allowed"));
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS origin not allowed"));
    },
    credentials: true,
  };

  app.use(cors(corsOptions));

  // Attach req.user when Authorization: Bearer ... is present.
  // Invalid/expired tokens are treated as unauthenticated.
  app.use(optionalUser);

  app.use(express.json({ limit: "1mb" }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_API || 300),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // This limiter is mounted at /api, so stream paths look like:
    // - /stream
    // - /admin/stream
    // SSE reconnects can be bursty; don't 429 the streams.
    skip: (req) => req.path === "/stream" || req.path === "/admin/stream",
  });

  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_ADMIN || 60),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Admin SSE stream should not be rate-limited.
    skip: (req) => req.path === "/stream",
  });

  // IMPORTANT: mount /api/admin before /api so admin requests don't get rate-limited twice.
  app.use("/api/admin", adminLimiter);
  app.use("/api", apiLimiter);

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "cb-kare-food-portal-server" });
  });

  // Auth endpoints stay public.
  app.use("/api/auth", authRouter);

  // SSE stream for client-side live updates (requires login; pass token via ?token=...)
  app.get("/api/stream", requireUser, (req, res) => {
    addPublicSseClient(req, res);
  });

  app.use("/api/foods", requireUser, foodsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/payment-qrs", requireUser, paymentQrsRouter);
  app.use("/api/user", userRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
