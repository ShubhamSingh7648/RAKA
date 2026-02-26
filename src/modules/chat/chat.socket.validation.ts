import { z } from "zod";
import { AppError } from "../../utils/errors/app.error";

const tokenSchema = z
  .string()
  .trim()
  .min(1, "Token is required");

const messageSchema = z
  .string()
  .trim()
  .min(1, "Message is required");

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid request id");

function parseWithAppError<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  fallbackMessage: string
): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || fallbackMessage;
    throw new AppError(message, 400);
  }
  return parsed.data;
}

export const validateUpgradeIdentityPayload = (payload: unknown) =>
  parseWithAppError(tokenSchema, payload, "Invalid token payload");

export const validateMessagePayload = (payload: unknown) =>
  parseWithAppError(messageSchema, payload, "Invalid message payload");

export const validateAcceptRequestPayload = (payload: unknown) =>
  parseWithAppError(objectIdSchema, payload, "Invalid request id");

export const validateRequestIdPayload = (payload: unknown) =>
  parseWithAppError(objectIdSchema, payload, "Invalid request id");

export const validateUserIdPayload = (payload: unknown) =>
  parseWithAppError(objectIdSchema, payload, "Invalid user id");
