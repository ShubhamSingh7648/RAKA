import mongoose, { Document, Schema } from "mongoose";

export type ConversationType = "random" | "private";

export interface IConversation extends Document {
  participants: [string, string];
  participantsKey?: string;
  type: ConversationType;
  lastMessage?: {
    senderId: string;
    content: string;
    createdAt: Date;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const buildConversationParticipantsKey = (
  userA: string,
  userB: string
) => [String(userA), String(userB)].sort().join("#");

const conversationSchema = new Schema<IConversation>(
  {
    participants: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => value.length === 2,
        message: "Conversation must have exactly two participants",
      },
    },
    participantsKey: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["random", "private"],
      required: true,
    },
    lastMessage: {
      senderId: {
        type: String,
      },
      content: {
        type: String,
      },
      createdAt: {
        type: Date,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index(
  { participantsKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "private",
      participantsKey: { $exists: true },
    },
  }
);

export const Conversation = mongoose.model<IConversation>(
  "Conversation",
  conversationSchema
);
