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

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, serverConfig.JWT_SECRET) as {
    userId: string;
    role: string;
  };
};