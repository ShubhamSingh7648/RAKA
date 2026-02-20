import jwt from "jsonwebtoken";
import { serverConfig } from "../../config";

export const generateAccessToken = (
  userId: string,
  role: string
) => {
  return jwt.sign(
    { userId, role },
    serverConfig.JWT_SECRET,
    { expiresIn: "15m" }
  );
};