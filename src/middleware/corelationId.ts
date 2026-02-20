import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { asyncLocalStorage } from "../utils/helpers/request.helper";

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {

  const correlationId =
    req.header("x-correlation-id") || uuidv4();

  // send back to client
  res.setHeader("x-correlation-id", correlationId);

  // create async context
  asyncLocalStorage.run({ correlationId }, () => {
    next();
  });
}