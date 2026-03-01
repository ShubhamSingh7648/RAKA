import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, refreshToken, register } from "./auth.controller";
import { validate } from "../../middleware/validate.middleware";
import { loginSchema, registerSchema } from "./auth.validation";
import { serverConfig } from "../../config";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: serverConfig.AUTH_LOGIN_WINDOW_MS,
  max: serverConfig.AUTH_LOGIN_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: serverConfig.AUTH_REGISTER_WINDOW_MS,
  max: serverConfig.AUTH_REGISTER_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Please try again later.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: serverConfig.AUTH_REFRESH_WINDOW_MS,
  max: serverConfig.AUTH_REFRESH_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many refresh attempts. Please try again later.",
  },
});

router.post("/register", registerLimiter, validate(registerSchema), register);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/refresh", refreshLimiter, refreshToken);

export default router;
