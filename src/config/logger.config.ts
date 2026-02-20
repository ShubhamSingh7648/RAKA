import winston from "winston";
import { getCorrelationId } from "../utils/helpers/request.helper";

const logger = winston.createLogger({
  level: "info",

  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),

    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        correlationId: getCorrelationId() || "SYSTEM",
        ...meta,
      });
    })
  ),

  transports: [
    new winston.transports.Console(),

    new winston.transports.File({
      filename: "logs/app.log",
    }),

    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
  ],
});

export default logger;