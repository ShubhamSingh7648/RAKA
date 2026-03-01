import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  bio?: string;
  displayPicture?: string;
  displayPicturePublicId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[a-zA-Z0-9_.-]+$/, "Invalid username format"],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    bio: {
      type: String,
      trim: true,
      default: "",
    },
    displayPicture: {
      type: String,
      trim: true,
      default: "",
    },
    displayPicturePublicId: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>("User", userSchema);


