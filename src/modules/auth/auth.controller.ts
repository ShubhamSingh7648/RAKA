import { Request, Response } from "express";
import { loginUser, refreshAccessToken, registerUser } from "./auth.service";
import { serverConfig } from "../../config";

const REFRESH_COOKIE_NAME = "refreshToken";
const isProduction = serverConfig.NODE_ENV === "production";
const sameSite =
  isProduction && serverConfig.COOKIE_SAMESITE === "lax"
    ? "none"
    : serverConfig.COOKIE_SAMESITE;
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction || sameSite === "none",
  sameSite,
  domain: serverConfig.COOKIE_DOMAIN,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const register = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  const result = await registerUser(username, email, password);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);

  return res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await loginUser(email, password);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);

  return res.status(200).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
};

export const refreshToken = async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Refresh token is missing",
    });
  }

  const refreshed = await refreshAccessToken(token);
  res.cookie(REFRESH_COOKIE_NAME, refreshed.refreshToken, REFRESH_COOKIE_OPTIONS);

  return res.status(200).json({
    success: true,
    data: {
      accessToken: refreshed.accessToken,
    },
  });
};
