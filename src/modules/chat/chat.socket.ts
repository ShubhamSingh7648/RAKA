import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { ChatService } from "./chat.service";
import {
  ClientToServerPayloads,
  ServerToClientPayloads,
  SocketErrorCodes,
} from "./chat.contracts";
import { buildSocketError, mapAppErrorToSocketError } from "./chat.error";
import {
  validateAcceptRequestPayload,
  validateMessagePayload,
  validateRequestIdPayload,
  validateUpgradeIdentityPayload,
  validateUserIdPayload,
} from "./chat.socket.validation";
import logger from "../../config/logger.config";
import { verifyAccessToken } from "../../utils/jwt/jwt";
import { User } from "../user/user.model";
import { FriendService } from "../friend/friend.service";
import { AppError } from "../../utils/errors/app.error";
import { PrivateService } from "../private/private.service";
import { Message } from "./models/message.model";
import { BlockService } from "../block/block.service";

function safeHandler(
  socket: Socket,
  handler: (...args: any[]) => Promise<void> | void,
  options?: {
    errorEvent?: "server_error" | "friend_error";
    fallbackMessage?: string;
  }
) {
  const errorEvent = options?.errorEvent || "server_error";
  const fallbackMessage = options?.fallbackMessage || "Something went wrong.";

  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (err) {
      logger.error(`Socket error for ${socket.id}`, err);

      const payload =
        err instanceof AppError
          ? mapAppErrorToSocketError(err)
          : buildSocketError(SocketErrorCodes.INTERNAL_ERROR, fallbackMessage, 500);

      socket.emit(errorEvent, payload);
    }
  };
}

export const registerChatHandlers = (io: Server) => {
  const chatNamespace = io.of("/chat");
  const blockService = new BlockService();
  const chatService = new ChatService(chatNamespace, blockService);
  const friendService = new FriendService();
  const privateService = new PrivateService(friendService);

  const emitToUserInChatNamespace = <T extends keyof ServerToClientPayloads>(
    userId: string,
    eventName: T,
    payload: ServerToClientPayloads[T]
  ) => {
    for (const namespaceSocket of chatNamespace.sockets.values()) {
      const identity = namespaceSocket.data.identity;
      if (identity?.type === "user" && identity.userId === userId) {
        namespaceSocket.emit(eventName, payload);
      }
    }
  };

  const broadcastOnlineCount = () => {
    const payload: ServerToClientPayloads["online_count"] = {
      count: chatNamespace.sockets.size,
    };
    chatNamespace.emit("online_count", payload);
  };

  chatNamespace.on("connection", async (socket: Socket) => {
    const guestId = uuidv4();
    socket.data.identity = {
      type: "guest",
      guestId,
    };

    logger.info(`Guest connected: ${guestId}`);

    const handshakeToken = socket.handshake.auth?.token;
    if (handshakeToken) {
      try {
        const decoded = verifyAccessToken(handshakeToken);
        const user = await User.findById(decoded.userId).select("username").lean();

        if (user) {
          socket.data.identity = {
            type: "user",
            guestId,
            userId: decoded.userId,
            username: user.username,
          };
          logger.info(`User connected via token: ${user.username}`);
        }
      } catch {
        logger.warn("Invalid token during handshake");
      }
    }

    broadcastOnlineCount();

    socket.on(
      "find_match",
      safeHandler(socket, async (payload: ClientToServerPayloads["find_match"]) => {
        if (typeof payload !== "undefined") {
          throw new AppError("find_match does not accept payload", 400);
        }
        await chatService.findMatch(socket);
      })
    );

    socket.on(
      "message",
      safeHandler(socket, async (payload: ClientToServerPayloads["message"]) => {
        const message = validateMessagePayload(payload);
        await chatService.handleMessage(socket, message);
      })
    );

    socket.on(
      "skip",
      safeHandler(socket, async (payload: ClientToServerPayloads["skip"]) => {
        if (typeof payload !== "undefined") {
          throw new AppError("skip does not accept payload", 400);
        }
        await chatService.skip(socket);
      })
    );

    socket.on(
      "disconnect",
      safeHandler(socket, async () => {
        await chatService.handleDisconnect(socket);
        broadcastOnlineCount();
      })
    );

    socket.on(
      "upgrade_identity",
      safeHandler(socket, async (payload: ClientToServerPayloads["upgrade_identity"]) => {
        if (socket.data.identity.type === "user") return;

        const token = validateUpgradeIdentityPayload(payload);

        try {
          const decoded = verifyAccessToken(token);
          const user = await User.findById(decoded.userId).select("username").lean();

          if (!user) {
            const failedPayload: ServerToClientPayloads["identity_upgraded"] = {
              success: false,
              message: "Token verification failed",
            };
            socket.emit("identity_upgraded", failedPayload);
            return;
          }

          socket.data.identity = {
            ...socket.data.identity,
            type: "user",
            userId: decoded.userId,
            username: user.username,
          };

          const successPayload: ServerToClientPayloads["identity_upgraded"] = {
            success: true,
          };
          socket.emit("identity_upgraded", successPayload);
          logger.info(`Identity upgraded for ${user.username}`);
        } catch {
          const failedPayload: ServerToClientPayloads["identity_upgraded"] = {
            success: false,
            message: "Token verification failed",
          };
          socket.emit("identity_upgraded", failedPayload);
          logger.warn("Identity upgrade failed");
        }
      })
    );

    socket.on(
      "send_friend_request",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["send_friend_request"]) => {
          if (typeof payload !== "undefined") {
            throw new AppError("send_friend_request does not accept payload", 400);
          }

          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(
                SocketErrorCodes.UNAUTHORIZED,
                "Login required to send friend request",
                401
              );
            socket.emit("friend_error", errorPayload);
            return;
          }

          const room = chatService.getRoomBySocket(socket.id);
          if (!room) return;

          const partnerSocketId = chatService.getPartnerSocketId(socket.id);
          if (!partnerSocketId) return;

          const partnerSocket = chatNamespace.sockets.get(partnerSocketId);
          if (!partnerSocket) return;

          if (partnerSocket.data.identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(
                SocketErrorCodes.BAD_REQUEST,
                "Stranger is not logged in",
                400
              );
            socket.emit("friend_error", errorPayload);
            return;
          }

          const request = await friendService.sendRequest(
            identity.userId,
            partnerSocket.data.identity.userId
          );

          const friendRequestPayload: ServerToClientPayloads["friend_request_message"] =
            {
              type: "friend_request",
              requestId: request._id.toString(),
              fromUsername: identity.username,
              from: {
                userId: identity.userId,
                username: identity.username,
              },
            };

          chatNamespace
            .to(room.roomId)
            .emit("friend_request_message", friendRequestPayload);

          logger.info(
            `Friend request sent from ${identity.username} to ${partnerSocket.data.identity.username}`
          );
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to send friend request",
        }
      )
    );

    socket.on(
      "accept_friend_request",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["accept_friend_request"]) => {
          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(SocketErrorCodes.UNAUTHORIZED, "Login required", 401);
            socket.emit("friend_error", errorPayload);
            return;
          }

          const requestId = validateAcceptRequestPayload(payload);
          await friendService.acceptRequest(requestId, identity.userId);

          const room = chatService.getRoomBySocket(socket.id);
          if (!room) return;

          const partnerSocketId = chatService.getPartnerSocketId(socket.id);
          if (!partnerSocketId) return;
          const partnerSocket = chatNamespace.sockets.get(partnerSocketId);
          if (!partnerSocket || partnerSocket.data.identity.type !== "user") return;

          await chatService.closeRoomBySocket(socket.id);

          const opened = await privateService.openPrivateChat(
            identity.userId,
            partnerSocket.data.identity.userId
          );

          socket.join(opened.roomId);
          partnerSocket.join(opened.roomId);

          const messages = await Message.find({ conversationId: opened.conversationId })
            .sort({ _id: -1 })
            .limit(30)
            .lean();

          const startedPayload: ServerToClientPayloads["private_chat_started"] = {
            conversationId: opened.conversationId,
            roomId: opened.roomId,
            messages: messages
              .map((message) => ({
                id: message._id.toString(),
                senderId: String(message.senderId),
                content: message.content,
                createdAt: new Date(message.createdAt).getTime(),
              }))
              .reverse(),
          };

          chatNamespace.to(opened.roomId).emit("private_chat_started", startedPayload);

          const acceptedPayload: ServerToClientPayloads["friend_request_accepted"] =
            {
              requestId,
              acceptedBy: identity.username,
              username: identity.username,
            };

          chatNamespace
            .to(room.roomId)
            .emit("friend_request_accepted", acceptedPayload);

          logger.info(
            `Friend request ${requestId} accepted by ${identity.username}`
          );
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to accept friend request",
        }
      )
    );

    socket.on(
      "list_friend_requests",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["list_friend_requests"]) => {
          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(SocketErrorCodes.UNAUTHORIZED, "Login required", 401);
            socket.emit("friend_error", errorPayload);
            return;
          }

          const listed = await friendService.listPendingRequests(
            identity.userId,
            payload?.limit
          );
          const listedPayload: ServerToClientPayloads["friend_requests_listed"] = {
            incoming: listed.incoming,
            outgoing: listed.outgoing,
          };
          socket.emit("friend_requests_listed", listedPayload);
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to list friend requests",
        }
      )
    );

    socket.on(
      "cancel_friend_request",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["cancel_friend_request"]) => {
          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(SocketErrorCodes.UNAUTHORIZED, "Login required", 401);
            socket.emit("friend_error", errorPayload);
            return;
          }

          const requestId = validateRequestIdPayload(payload);
          const cancelled = await friendService.cancelRequest(requestId, identity.userId);
          const cancelledPayload: ServerToClientPayloads["friend_request_cancelled"] = {
            requestId: cancelled.requestId,
            cancelledByUserId: identity.userId,
          };

          emitToUserInChatNamespace(cancelled.fromUserId, "friend_request_cancelled", cancelledPayload);
          emitToUserInChatNamespace(cancelled.toUserId, "friend_request_cancelled", cancelledPayload);
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to cancel friend request",
        }
      )
    );

    socket.on(
      "reject_friend_request",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["reject_friend_request"]) => {
          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(SocketErrorCodes.UNAUTHORIZED, "Login required", 401);
            socket.emit("friend_error", errorPayload);
            return;
          }

          const requestId = validateRequestIdPayload(payload);
          const rejected = await friendService.rejectRequest(requestId, identity.userId);
          const rejectedPayload: ServerToClientPayloads["friend_request_rejected"] = {
            requestId: rejected.requestId,
            rejectedByUserId: identity.userId,
          };

          emitToUserInChatNamespace(rejected.fromUserId, "friend_request_rejected", rejectedPayload);
          emitToUserInChatNamespace(rejected.toUserId, "friend_request_rejected", rejectedPayload);
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to reject friend request",
        }
      )
    );

    socket.on(
      "list_blocked_users",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["list_blocked_users"]) => {
          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(SocketErrorCodes.UNAUTHORIZED, "Login required", 401);
            socket.emit("friend_error", errorPayload);
            return;
          }

          const listed = await blockService.listBlockedUsers(
            identity.userId,
            payload?.limit
          );
          const eventPayload: ServerToClientPayloads["blocked_users_listed"] = {
            users: listed.users,
          };
          socket.emit("blocked_users_listed", eventPayload);
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to list blocked users",
        }
      )
    );

    socket.on(
      "block_user",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["block_user"]) => {
          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(SocketErrorCodes.UNAUTHORIZED, "Login required", 401);
            socket.emit("friend_error", errorPayload);
            return;
          }

          const blockedUserId = validateUserIdPayload(payload);
          await blockService.blockUser(identity.userId, blockedUserId);

          const eventPayload: ServerToClientPayloads["user_blocked"] = {
            blockedUserId,
          };
          socket.emit("user_blocked", eventPayload);
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to block user",
        }
      )
    );

    socket.on(
      "unblock_user",
      safeHandler(
        socket,
        async (payload: ClientToServerPayloads["unblock_user"]) => {
          const identity = socket.data.identity;
          if (identity.type !== "user") {
            const errorPayload: ServerToClientPayloads["friend_error"] =
              buildSocketError(SocketErrorCodes.UNAUTHORIZED, "Login required", 401);
            socket.emit("friend_error", errorPayload);
            return;
          }

          const blockedUserId = validateUserIdPayload(payload);
          await blockService.unblockUser(identity.userId, blockedUserId);

          const eventPayload: ServerToClientPayloads["user_unblocked"] = {
            unblockedUserId: blockedUserId,
          };
          socket.emit("user_unblocked", eventPayload);
        },
        {
          errorEvent: "friend_error",
          fallbackMessage: "Unable to unblock user",
        }
      )
    );
  });
};
