import express from 'express';
import http from "http";
import { Server } from "socket.io";

import { serverConfig } from './config';
import v1Router from './router/v1/index.router';
import v2Router from './router/v2/index.router';
import { genericErrorHandler } from './middleware/error.middleware';
import { correlationIdMiddleware } from './middleware/corelationId';
import logger from "./config/logger.config";
import { connectDB } from "./config/db.config";
import { registerChatHandlers } from "./modules/chat/chat.socket";



const app = express();

app.use(express.json());
app.use(correlationIdMiddleware);
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

app.get("/", (req, res) => {
  res.send("Root working");
});

app.use(genericErrorHandler);

// 👇 CREATE HTTP SERVER MANUALLY
const httpServer = http.createServer(app);

// 👇 ATTACH SOCKET.IO
export const io = new Server(httpServer, {
  cors: {
    origin: "*",
  }
});
registerChatHandlers(io);

const startServer = async () => {
  await connectDB();

  httpServer.listen(serverConfig.PORT, () => {
    logger.info(`Server is running on port ${serverConfig.PORT}`);
  });
};

startServer();
