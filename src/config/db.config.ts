import mongoose from "mongoose";
import { serverConfig } from "./index";
import logger from "./logger.config";

export const connectDB = async () => {
  try {
    await mongoose.connect(serverConfig.MONGO_URL);
    logger.info("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
};