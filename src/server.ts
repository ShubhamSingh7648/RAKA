import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";

import { serverConfig } from "./config";
import v1Router from "./router/v1/index.router";
import v2Router from "./router/v2/index.router";
import { genericErrorHandler } from "./middleware/error.middleware";
import { correlationIdMiddleware } from "./middleware/corelationId";
import logger from "./config/logger.config";
import { connectDB } from "./config/db.config";
import { registerChatHandlers } from "./modules/chat/chat.socket";
import { registerPrivateHandlers } from "./modules/private/private.socket";

const app = express();

const defaultDevOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const allowedOrigins = new Set(
  serverConfig.CORS_ORIGINS.length > 0
    ? serverConfig.CORS_ORIGINS
    : defaultDevOrigins
);

const isLocalhostOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

const corsOriginValidator = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  const allowLocalhostOrigin =
    serverConfig.NODE_ENV !== "production" && isLocalhostOrigin(origin);

  if (allowedOrigins.has(origin) || allowLocalhostOrigin) {
    callback(null, true);
    return;
  }

  callback(new Error(`CORS blocked for origin: ${origin}`));
};

app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
  })
);

app.use(express.json());
app.use(correlationIdMiddleware);

app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);

app.get("/", (_req, res) => {
  res.send("Root working");
});

app.use(genericErrorHandler);

const httpServer = http.createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => corsOriginValidator(origin, callback),
    credentials: true,
    methods: ["GET", "POST"],
  },
});

registerChatHandlers(io);
registerPrivateHandlers(io);

let isShuttingDown = false;

const shutdown = async (reason: string, err?: unknown) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (err) {
    logger.error(`Shutdown triggered: ${reason}`, err);
  } else {
    logger.info(`Shutdown triggered: ${reason}`);
  }

  const forceExitTimer = setTimeout(() => {
    logger.error("Force exiting after shutdown timeout");
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    io.close();

    await new Promise<void>((resolve, reject) => {
      httpServer.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve();
      });
    });

    await mongoose.disconnect();
    clearTimeout(forceExitTimer);
    process.exit(err ? 1 : 0);
  } catch (shutdownErr) {
    logger.error("Graceful shutdown failed", shutdownErr);
    process.exit(1);
  }
};

const startServer = async () => {
  await connectDB();

  httpServer.listen(serverConfig.PORT, () => {
    logger.info(`Server is running on port ${serverConfig.PORT}`);
  });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (err) => {
  void shutdown("uncaughtException", err);
});

process.on("unhandledRejection", (err) => {
  void shutdown("unhandledRejection", err);
});

startServer();
