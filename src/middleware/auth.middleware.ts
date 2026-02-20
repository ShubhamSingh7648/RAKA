import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config/index";
import { AppError } from "../utils/errors/app.error";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Unauthorized", 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, serverConfig.JWT_SECRET) as {
      userId: string;
      role: string;
    };

    req.user = decoded;

    next();
  } catch (error) {
    throw new AppError("Unauthorized", 401);
  }
};