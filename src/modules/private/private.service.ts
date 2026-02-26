import mongoose from "mongoose";
import { AppError } from "../../utils/errors/app.error";
import { FriendService } from "../friend/friend.service";
import { BlockService } from "../block/block.service";
import { User } from "../user/user.model";
import {
  buildConversationParticipantsKey,
  Conversation,
} from "../chat/models/conversation.model";
import { Message } from "../chat/models/message.model";

interface LoadMessagesParams {
  userId: string;
  conversationId: string;
  cursor?: string;
  limit?: number;
}

interface ListConversationsParams {
  userId: string;
  limit?: number;
}

interface MarkReadParams {
  userId: string;
  conversationId: string;
  messageId: string;
}

interface MarkDeliveredParams {
  userId: string;
  conversationId: string;
  messageId: string;
}

export class PrivateService {
  private blockService = new BlockService();

  constructor(private friendService: FriendService) {}

  private isDuplicateKeyError(err: unknown) {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    );
  }

  async openPrivateChat(userId: string, friendUserId: string) {
    if (!userId || !friendUserId) {
      throw new AppError("userId and friendUserId are required", 400);
    }

    if (userId === friendUserId) {
      throw new AppError("Cannot open private chat with yourself", 400);
    }

    const isBlocked = await this.blockService.isBlockedEitherDirection(
      userId,
      friendUserId
    );
    if (isBlocked) {
      throw new AppError("Private chat is blocked between these users", 403);
    }

    const isFriend = await this.friendService.areFriends(userId, friendUserId);
    if (!isFriend) {
      throw new AppError("Private chat is allowed only between friends", 403);
    }

    const [participant1, participant2] = [userId, friendUserId].sort();
    const participantsKey = buildConversationParticipantsKey(
      participant1,
      participant2
    );
    const upsertPrivateConversation = () =>
      Conversation.findOneAndUpdate(
        { participantsKey, type: "private" },
        {
          $setOnInsert: {
            participants: [participant1, participant2],
            participantsKey,
            type: "private",
          },
          $set: { isActive: true },
        },
        { upsert: true, new: true }
      );

    let conversation = await Conversation.findOne({
      participantsKey,
      type: "private",
    });

    if (!conversation) {
      try {
        conversation = await upsertPrivateConversation();
      } catch (err) {
        // Another request may have inserted concurrently, or an old random conversation
        // may still hold the same pair-key in legacy data.
        if (this.isDuplicateKeyError(err)) {
          conversation = await Conversation.findOne({
            participantsKey,
            type: "private",
          });

          if (!conversation) {
            const randomConflict = await Conversation.findOne({
              participantsKey,
              type: "random",
            });

            if (randomConflict) {
              randomConflict.participantsKey = `random:${participantsKey}:${randomConflict._id.toString()}`;
              await randomConflict.save();
              try {
                conversation = await upsertPrivateConversation();
              } catch (retryErr) {
                if (this.isDuplicateKeyError(retryErr)) {
                  conversation = await Conversation.findOne({
                    participantsKey,
                    type: "private",
                  });
                } else {
                  throw retryErr;
                }
              }
            }
          }
        } else {
          throw err;
        }
      }
    } else if (!conversation.isActive) {
      conversation.isActive = true;
      await conversation.save();
    }

    if (
      conversation &&
      Array.isArray(conversation.hiddenBy) &&
      conversation.hiddenBy.includes(userId)
    ) {
      conversation.hiddenBy = conversation.hiddenBy.filter(
        (hiddenUserId) => hiddenUserId !== userId
      );
      await conversation.save();
    }

    if (!conversation) {
      throw new AppError("Failed to open private conversation", 500);
    }

    await Message.updateMany(
      {
        conversationId: conversation._id,
        senderId: { $ne: userId },
      },
      {
        $addToSet: {
          deliveredTo: userId,
          readBy: userId,
        },
      }
    );

    return {
      conversationId: conversation._id.toString(),
      roomId: this.getRoomId(conversation._id.toString()),
    };
  }

  async sendPrivateMessage(
    userId: string,
    conversationId: string,
    content: string
  ) {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      throw new AppError("Message content is required", 400);
    }
    if (normalizedContent.length > 500) {
      throw new AppError("Message too long", 400);
    }

    const conversation = await this.assertConversationMember(
      userId,
      conversationId
    );

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: userId,
      content: normalizedContent,
      deliveredTo: [],
      readBy: [],
    });

    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessage: {
            senderId: userId,
            content: message.content,
            createdAt: message.createdAt,
          },
          updatedAt: message.createdAt,
        },
        $pull: {
          hiddenBy: {
            $in: conversation.participants.map((participantId) =>
              participantId.toString()
            ),
          },
        },
      }
    );

    return {
      messageId: message._id.toString(),
      conversationId: conversation._id.toString(),
      senderId: userId,
      content: message.content,
      createdAt: message.createdAt.getTime(),
    };
  }

  async loadPrivateMessages({
    userId,
    conversationId,
    cursor,
    limit,
  }: LoadMessagesParams) {
    const conversation = await this.assertConversationMember(
      userId,
      conversationId
    );

    const safeLimit = Math.min(Math.max(limit ?? 30, 1), 100);
    const query: Record<string, unknown> = {
      conversationId: conversation._id,
    };

    if (cursor) {
      if (!mongoose.Types.ObjectId.isValid(cursor)) {
        throw new AppError("Invalid cursor", 400);
      }
      query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const messages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(safeLimit)
      .lean();

    const nextCursor =
      messages.length === safeLimit ? messages[messages.length - 1]._id.toString() : null;

    return {
      conversationId: conversation._id.toString(),
      messages: messages
        .map((msg) => ({
          id: msg._id.toString(),
          senderId: String(msg.senderId),
          content: msg.content,
          createdAt: new Date(msg.createdAt).getTime(),
          readBy: Array.isArray(msg.readBy)
            ? msg.readBy.map((userId) => String(userId))
            : [],
        }))
        .reverse(),
      nextCursor,
    };
  }

  async listPrivateConversations({ userId, limit }: ListConversationsParams) {
    const safeLimit = Math.min(Math.max(limit ?? 30, 1), 100);

    const conversations = await Conversation.find({
      participants: userId,
      type: "private",
      hiddenBy: { $ne: userId },
    })
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .lean();

    if (conversations.length === 0) {
      return {
        conversations: [],
      };
    }

    const uniqueParticipantIds = Array.from(
      new Set(
        conversations.flatMap((conversation) =>
          conversation.participants.map((participantId) => participantId.toString())
        )
      )
    );
    const users = await User.find({ _id: { $in: uniqueParticipantIds } })
      .select("_id username")
      .lean();
    const usernameById = new Map(
      users.map((user) => [user._id.toString(), user.username])
    );
    const unreadCounts = await Promise.all(
      conversations.map((conversation) =>
        Message.countDocuments({
          conversationId: conversation._id,
          senderId: { $ne: userId },
          readBy: { $nin: [userId] },
        })
      )
    );
    const unreadCountByConversationId = new Map<string, number>(
      conversations.map((conversation, index) => [
        conversation._id.toString(),
        unreadCounts[index] ?? 0,
      ])
    );

    return {
      conversations: conversations.map((conversation) => {
        const conversationId = conversation._id.toString();
        const lastMessage = conversation.lastMessage;

        return {
          conversationId,
          participantUserIds: conversation.participants.map((participantId) =>
            participantId.toString()
          ),
          participantProfiles: conversation.participants.map((participantId) => {
            const userId = participantId.toString();
            return {
              userId,
              username: usernameById.get(userId) ?? "Unknown",
            };
          }),
          lastMessage: lastMessage
            ? {
                senderId: String(lastMessage.senderId),
                content: lastMessage.content,
                createdAt: new Date(lastMessage.createdAt).getTime(),
              }
            : null,
          updatedAt: new Date(conversation.updatedAt).getTime(),
          isActive: conversation.isActive,
          unreadCount: unreadCountByConversationId.get(conversationId) ?? 0,
        };
      }),
    };
  }

  async markRead({ userId, conversationId, messageId }: MarkReadParams) {
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new AppError("Invalid messageId", 400);
    }

    const conversation = await this.assertConversationMember(userId, conversationId);
    const updateResult = await Message.updateOne(
      {
        _id: new mongoose.Types.ObjectId(messageId),
        conversationId: conversation._id,
        senderId: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId, deliveredTo: userId },
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new AppError("Message not found", 404);
    }

    return {
      conversationId,
      messageId,
      readerId: userId,
    };
  }

  async markDelivered({
    userId,
    conversationId,
    messageId,
  }: MarkDeliveredParams) {
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new AppError("Invalid messageId", 400);
    }

    const conversation = await this.assertConversationMember(userId, conversationId);
    const updateResult = await Message.updateOne(
      {
        _id: new mongoose.Types.ObjectId(messageId),
        conversationId: conversation._id,
        senderId: { $ne: userId },
      },
      {
        $addToSet: { deliveredTo: userId },
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new AppError("Message not found", 404);
    }

    return {
      conversationId,
      messageId,
      recipientId: userId,
    };
  }

  async deletePrivateConversation(userId: string, conversationId: string) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError("Invalid conversationId", 400);
    }

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }
    if (conversation.type !== "private") {
      throw new AppError("Conversation is not private", 400);
    }

    const isParticipant = conversation.participants.some(
      (participantId) => participantId.toString() === userId
    );
    if (!isParticipant) {
      throw new AppError("Not authorized for this conversation", 403);
    }

    const hiddenBy = Array.isArray(conversation.hiddenBy)
      ? conversation.hiddenBy.map((hiddenUserId) => String(hiddenUserId))
      : [];

    if (!hiddenBy.includes(userId)) {
      const updated = await Conversation.findByIdAndUpdate(
        conversation._id,
        {
          $addToSet: { hiddenBy: userId },
          $set: { isActive: false },
        },
        { new: true, lean: true }
      );

      if (updated) {
        const hiddenBySet = new Set(
          Array.isArray(updated.hiddenBy)
            ? updated.hiddenBy.map((hiddenUserId) => String(hiddenUserId))
            : []
        );
        const allParticipantsHidden = updated.participants.every((participantId) =>
          hiddenBySet.has(participantId.toString())
        );

        if (allParticipantsHidden) {
          await Message.deleteMany({ conversationId: updated._id });
          await Conversation.deleteOne({ _id: updated._id });
        }
      }
    }

    return {
      conversationId: conversation._id.toString(),
    };
  }

  getRoomId(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  private async assertConversationMember(userId: string, conversationId: string) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError("Invalid conversationId", 400);
    }

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }
    if (conversation.type !== "private") {
      throw new AppError("Conversation is not private", 400);
    }

    const isParticipant = conversation.participants.some(
      (participantId) => participantId.toString() === userId
    );

    if (!isParticipant) {
      throw new AppError("Not authorized for this conversation", 403);
    }

    const isHiddenForUser =
      Array.isArray(conversation.hiddenBy) &&
      conversation.hiddenBy.some((hiddenUserId) => hiddenUserId === userId);
    if (isHiddenForUser) {
      throw new AppError("Conversation not found", 404);
    }

    const otherParticipant = conversation.participants.find(
      (participantId) => participantId.toString() !== userId
    );
    if (otherParticipant) {
      const isBlocked = await this.blockService.isBlockedEitherDirection(
        userId,
        otherParticipant.toString()
      );
      if (isBlocked) {
        throw new AppError("Conversation is blocked between users", 403);
      }
    }

    return conversation;
  }
}
