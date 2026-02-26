import dotenv from "dotenv";

dotenv.config();

type ServerConfig = {
  PORT: number;
  JWT_SECRET: string;
  MONGO_URL: string;
  NODE_ENV: string;
  CORS_ORIGINS: string[];
  AUTH_LOGIN_WINDOW_MS: number;
  AUTH_LOGIN_MAX_ATTEMPTS: number;
  AUTH_REGISTER_WINDOW_MS: number;
  AUTH_REGISTER_MAX_ATTEMPTS: number;
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

const parsePositiveInt = (
  rawValue: string | undefined,
  defaultValue: number,
  envName: string
) => {
  if (!rawValue) return defaultValue;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }
  return parsed;
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
  AUTH_LOGIN_WINDOW_MS: parsePositiveInt(
    process.env.AUTH_LOGIN_WINDOW_MS,
    15 * 60 * 1000,
    "AUTH_LOGIN_WINDOW_MS"
  ),
  AUTH_LOGIN_MAX_ATTEMPTS: parsePositiveInt(
    process.env.AUTH_LOGIN_MAX_ATTEMPTS,
    5,
    "AUTH_LOGIN_MAX_ATTEMPTS"
  ),
  AUTH_REGISTER_WINDOW_MS: parsePositiveInt(
    process.env.AUTH_REGISTER_WINDOW_MS,
    60 * 60 * 1000,
    "AUTH_REGISTER_WINDOW_MS"
  ),
  AUTH_REGISTER_MAX_ATTEMPTS: parsePositiveInt(
    process.env.AUTH_REGISTER_MAX_ATTEMPTS,
    3,
    "AUTH_REGISTER_MAX_ATTEMPTS"
  ),
};
