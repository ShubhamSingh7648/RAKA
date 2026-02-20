import bcrypt from "bcrypt";
import { User } from "../user/user.model";
import { AppError } from "../../utils/errors/app.error";
import { generateAccessToken } from "../../utils/jwt/jwt";

export const registerUser = async (
  username: string,
  email: string,
  password: string
) => {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new AppError("Email already in use", 409);
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const user = await User.create({
    username,
    email,
    passwordHash,
  });

  return user;
};

export const loginUser = async (
  email: string,
  password: string
) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    throw new AppError("Invalid credentials", 401);
  }

  const accessToken = generateAccessToken(
    user._id.toString(),
    "user"
  );

  return {
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
    accessToken,
  };
};