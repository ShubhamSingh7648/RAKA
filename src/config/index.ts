import dotenv from "dotenv";

dotenv.config();

type ServerConfig = {
  PORT: number;
  JWT_SECRET: string;
  MONGO_URL: string;
  NODE_ENV: string;
  CORS_ORIGINS: string[];
};

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parsePort = (rawPort: string | undefined) => {
  if (!rawPort) return 3001;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid integer between 1 and 65535");
  }
  return port;
};

const parseCsvList = (value: string | undefined) => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const jwtSecret = getRequiredEnv("JWT_SECRET");
if (jwtSecret.length < 16) {
  throw new Error("JWT_SECRET must be at least 16 characters long");
}

export const serverConfig: ServerConfig = {
  PORT: parsePort(process.env.PORT),
  JWT_SECRET: jwtSecret,
  MONGO_URL: getRequiredEnv("MONGO_URL"),
  NODE_ENV: process.env.NODE_ENV?.trim() || "development",
  CORS_ORIGINS: parseCsvList(process.env.CORS_ORIGINS),
};
