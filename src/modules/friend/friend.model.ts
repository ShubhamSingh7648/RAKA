import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFriend extends Document {
  user: Types.ObjectId;
  friend: Types.ObjectId;
  createdAt: Date;
}

const friendSchema = new Schema<IFriend>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    friend: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate friendship
friendSchema.index({ user: 1, friend: 1 }, { unique: true });

export const Friend = mongoose.model<IFriend>("Friend", friendSchema);