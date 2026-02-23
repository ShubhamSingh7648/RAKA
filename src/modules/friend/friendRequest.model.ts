import mongoose, { Document, Schema, Types } from "mongoose";

export type FriendRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "expired";

export interface IFriendRequest extends Document {
  fromUser: Types.ObjectId;
  toUser: Types.ObjectId;
  participantsKey?: string;
  status: FriendRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export const buildParticipantsKey = (
  userA: Types.ObjectId | string,
  userB: Types.ObjectId | string
) => [String(userA), String(userB)].sort().join("#");

const friendRequestSchema = new Schema<IFriendRequest>(
  {
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    participantsKey: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled", "expired"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// One active pending request per user-pair (A<->B), regardless of direction.
friendRequestSchema.index(
  { participantsKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "pending",
      participantsKey: { $exists: true },
    },
  }
);

// Auto-expire only pending requests.
friendRequestSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: {
      status: "pending",
      expiresAt: { $exists: true },
    },
  }
);

export const FriendRequest = mongoose.model<IFriendRequest>(
  "FriendRequest",
  friendRequestSchema
);
