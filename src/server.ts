import express from 'express';
import { serverConfig } from './config';
import v1Router from './router/v1/index.router';
import v2Router from './router/v2/index.router';
import { genericErrorHandler } from './middleware/error.middleware';
import { correlationIdMiddleware } from './middleware/corelationId';
import logger from "./config/logger.config";
import { connectDB } from "./config/db.config";

const app = express();

app.use(express.json());

app.use(correlationIdMiddleware);
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);
app.get("/", (req, res) => {
  res.send("Root working");
});

app.use(genericErrorHandler);

const startServer = async () => {
  await connectDB();

  app.listen(serverConfig.PORT, () => {
    logger.info(`Server is running on port ${serverConfig.PORT}`);
  });
};

startServer();