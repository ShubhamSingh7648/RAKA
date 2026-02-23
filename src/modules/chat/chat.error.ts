import { AppError } from "../../utils/errors/app.error";
import {
  SocketErrorCodes,
  SocketErrorCode,
  SocketErrorPayload,
} from "./chat.contracts";

export const buildSocketError = (
  code: SocketErrorCode,
  message: string,
  statusCode = 500
): SocketErrorPayload => {
  const retryable =
    statusCode >= 500 || code === SocketErrorCodes.RATE_LIMITED;

  return {
    code,
    message,
    statusCode,
    retryable,
  };
};

export const mapAppErrorToSocketError = (
  err: AppError
): SocketErrorPayload => {
  switch (err.statusCode) {
    case 400:
      return buildSocketError(
        SocketErrorCodes.BAD_REQUEST,
        err.message,
        err.statusCode
      );
    case 401:
      return buildSocketError(
        SocketErrorCodes.UNAUTHORIZED,
        err.message,
        err.statusCode
      );
    case 403:
      return buildSocketError(
        SocketErrorCodes.FORBIDDEN,
        err.message,
        err.statusCode
      );
    case 404:
      return buildSocketError(
        SocketErrorCodes.NOT_FOUND,
        err.message,
        err.statusCode
      );
    case 409:
      return buildSocketError(
        SocketErrorCodes.CONFLICT,
        err.message,
        err.statusCode
      );
    case 429:
      return buildSocketError(
        SocketErrorCodes.RATE_LIMITED,
        err.message,
        err.statusCode
      );
    default:
      return buildSocketError(
        SocketErrorCodes.INTERNAL_ERROR,
        err.message || "Something went wrong.",
        err.statusCode || 500
      );
  }
};
