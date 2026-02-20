import { Request, Response } from "express";
import { registerUser, loginUser } from "./auth.service";

export const register = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  const user = await registerUser(username, email, password);

  return res.status(201).json({
    success: true,
    data: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await loginUser(email, password);

  return res.status(200).json({
    success: true,
    data: result,
  });
};