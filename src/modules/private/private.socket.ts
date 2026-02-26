import { Server, Socket } from "socket.io";
import logger from "../../config/logger.config";
import { AppError } from "../../utils/errors/app.error";
import { verifyAccessToken } from "../../utils/jwt/jwt";
import { User } from "../user/user.model";
import { FriendService } from "../friend/friend.service";
import {
  PrivateClientToServerPayloads,
  PrivateErrorPayload,
  PrivateServerToClientPayloads,
} from "./private.contracts";
import { PrivateService } from "./private.service";
import { BlockService } from "../block/block.service";

function buildPrivateError(err: unknown): PrivateErrorPayload {
  if (err instanceof AppError) {
    return {
      message: err.message,
      statusCode: err.statusCode,
    };
  }

  return {
    message: "Something went wrong.",
    statusCode: 500,
  };
}

function safeHandler(
  socket: Socket,
  handler: (...args: any[]) => Promise<void> | void
) {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (err) {
      logger.error(`Private socket error for ${socket.id}`, err);
      socket.emit("private_error", buildPrivateError(err));
    }
  };
}

function requireUserId(socket: Socket): string {
  const identity = socket.data.identity;
  if (identity?.type !== "user" || !identity.userId) {
    throw new AppError("Login required", 401);
  }
  return identity.userId;
}

export const registerPrivateHandlers = (io: Server) => {
  const privateNamespace = io.of("/private");
  const friendService = new FriendService();
  const privateService = new PrivateService(friendService);
  const blockService = new BlockService();

  privateNamespace.use(async (socket, next) => {
    const handshakeToken = socket.handshake.auth?.token;
    if (!handshakeToken) {
      next(new Error("Unauthorized"));
      return;
    }

    try {
      const decoded = verifyAccessToken(handshakeToken);
      const user = await User.findById(decoded.userId).select("_id").lean();

      if (!user) {
        next(new Error("Unauthorized"));
        return;
      }

      socket.data.identity = {
        type: "user",
        userId: decoded.userId,
      };
      next();
    } catch {
      logger.warn("Invalid token on /private handshake");
      next(new Error("Unauthorized"));
    }
  });

  privateNamespace.on("connection", async (socket: Socket) => {
    socket.on(
      "open_private_chat",
      safeHandler(
        socket,
        async (payload: PrivateClientToServerPayloads["open_private_chat"]) => {
          const userId = requireUserId(socket);
          const friendUserId = payload?.friendUserId?.trim();

          if (!friendUserId) {
            throw new AppError("friendUserId is required", 400);
          }

          const opened = await privateService.openPrivateChat(userId, friendUserId);
          socket.join(opened.roomId);

          const eventPayload: PrivateServerToClientPayloads["private_chat_opened"] = {
            conversationId: opened.conversationId,
            roomId: opened.roomId,
          };
          socket.emit("private_chat_opened", eventPayload);
        }
      )
    );

    socket.on(
      "send_private_message",
      safeHandler(
        socket,
        async (payload: PrivateClientToServerPayloads["send_private_message"]) => {
          const userId = requireUserId(socket);
          const conversationId = payload?.conversationId?.trim();
          const content = payload?.content ?? "";

          if (!conversationId) {
            throw new AppError("conversationId is required", 400);
          }

          const sent = await privateService.sendPrivateMessage(
            userId,
            conversationId,
            content
          );
          const roomId = privateService.getRoomId(conversationId);
          socket.join(roomId);

          const roomSockets = privateNamespace.adapter.rooms.get(roomId);
          const recipientIds = new Set<string>();
          if (roomSockets) {
            for (const socketId of roomSockets) {
              const roomSocket = privateNamespace.sockets.get(socketId);
              const roomIdentity = roomSocket?.data?.identity;
              if (
                roomIdentity?.type === "user" &&
                roomIdentity.userId &&
                roomIdentity.userId !== userId
              ) {
                recipientIds.add(roomIdentity.userId);
              }
            }
          }

          for (const recipientId of recipientIds) {
            await privateService.markDelivered({
              userId: recipientId,
              conversationId,
              messageId: sent.messageId,
            });
          }

          const eventPayload: PrivateServerToClientPayloads["private_message"] = {
            id: sent.messageId,
            conversationId: sent.conversationId,
            senderId: sent.senderId,
            content: sent.content,
            createdAt: sent.createdAt,
            readBy: [],
          };
          privateNamespace.to(roomId).emit("private_message", eventPayload);
        }
      )
    );

    socket.on(
      "load_private_messages",
      safeHandler(
        socket,
        async (payload: PrivateClientToServerPayloads["load_private_messages"]) => {
          const userId = requireUserId(socket);
          const conversationId = payload?.conversationId?.trim();

          if (!conversationId) {
            throw new AppError("conversationId is required", 400);
          }

          const loaded = await privateService.loadPrivateMessages({
            userId,
            conversationId,
            cursor: payload?.cursor,
            limit: payload?.limit,
          });

          const eventPayload: PrivateServerToClientPayloads["private_messages_loaded"] =
            {
              conversationId: loaded.conversationId,
              messages: loaded.messages,
              nextCursor: loaded.nextCursor,
            };
          socket.emit("private_messages_loaded", eventPayload);
        }
      )
    );

    socket.on(
      "list_private_conversations",
      safeHandler(
        socket,
        async (
          payload: PrivateClientToServerPayloads["list_private_conversations"]
        ) => {
          const userId = requireUserId(socket);

          const listed = await privateService.listPrivateConversations({
            userId,
            limit: payload?.limit,
          });

          const eventPayload: PrivateServerToClientPayloads["private_conversations_listed"] =
            {
              conversations: listed.conversations,
            };

          socket.emit("private_conversations_listed", eventPayload);
        }
      )
    );

    socket.on(
      "mark_read",
      safeHandler(
        socket,
        async (payload: PrivateClientToServerPayloads["mark_read"]) => {
          const userId = requireUserId(socket);
          const conversationId = payload?.conversationId?.trim();
          const messageId = payload?.messageId?.trim();

          if (!conversationId) {
            throw new AppError("conversationId is required", 400);
          }
          if (!messageId) {
            throw new AppError("messageId is required", 400);
          }

          const updated = await privateService.markRead({
            userId,
            conversationId,
            messageId,
          });

          const roomId = privateService.getRoomId(conversationId);
          socket.join(roomId);

          const eventPayload: PrivateServerToClientPayloads["private_message_read"] =
            {
              conversationId: updated.conversationId,
              messageId: updated.messageId,
              readerId: updated.readerId,
            };

          privateNamespace.to(roomId).emit("private_message_read", eventPayload);
        }
      )
    );

    socket.on(
      "delete_private_conversation",
      safeHandler(
        socket,
        async (
          payload: PrivateClientToServerPayloads["delete_private_conversation"]
        ) => {
          const userId = requireUserId(socket);
          const conversationId = payload?.conversationId?.trim();

          if (!conversationId) {
            throw new AppError("conversationId is required", 400);
          }

          const deleted = await privateService.deletePrivateConversation(
            userId,
            conversationId
          );
          const roomId = privateService.getRoomId(deleted.conversationId);

          const eventPayload: PrivateServerToClientPayloads["delete_private_conversation_success"] =
            {
              conversationId: deleted.conversationId,
            };

          socket.emit("delete_private_conversation_success", eventPayload);
          socket.to(roomId).emit("delete_private_conversation_success", eventPayload);
        }
      )
    );

    socket.on(
      "list_blocked_users",
      safeHandler(
        socket,
        async (payload: PrivateClientToServerPayloads["list_blocked_users"]) => {
          const userId = requireUserId(socket);

          const listed = await blockService.listBlockedUsers(userId, payload?.limit);
          const eventPayload: PrivateServerToClientPayloads["blocked_users_listed"] = {
            users: listed.users,
          };
          socket.emit("blocked_users_listed", eventPayload);
        }
      )
    );

    socket.on(
      "block_user",
      safeHandler(
        socket,
        async (payload: PrivateClientToServerPayloads["block_user"]) => {
          const userId = requireUserId(socket);
          const blockedUserId = payload?.userId?.trim();

          if (!blockedUserId) {
            throw new AppError("userId is required", 400);
          }

          await blockService.blockUser(userId, blockedUserId);
          const eventPayload: PrivateServerToClientPayloads["user_blocked"] = {
            blockedUserId,
          };
          socket.emit("user_blocked", eventPayload);
        }
      )
    );

    socket.on(
      "unblock_user",
      safeHandler(
        socket,
        async (payload: PrivateClientToServerPayloads["unblock_user"]) => {
          const userId = requireUserId(socket);
          const blockedUserId = payload?.userId?.trim();

          if (!blockedUserId) {
            throw new AppError("userId is required", 400);
          }

          await blockService.unblockUser(userId, blockedUserId);
          const eventPayload: PrivateServerToClientPayloads["user_unblocked"] = {
            unblockedUserId: blockedUserId,
          };
          socket.emit("user_unblocked", eventPayload);
        }
      )
    );
  });
};
