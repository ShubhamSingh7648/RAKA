import { Socket, Namespace } from "socket.io";
import { MatchQueue } from "./chat.queue";
import { RoomManager } from "./chat.room.manager";
import { MessageRateState, Room, SocketId, UserState } from "./chat.types";
import { ServerToClientPayloads } from "./chat.contracts";

import { chatConfig } from "../../config/chat.config";
import logger from "../../config/logger.config";


export class ChatService {
  private queue = new MatchQueue();
  private roomManager = new RoomManager();

  private userStates: Map<SocketId, UserState> = new Map();
  private messageRateMap: Map<SocketId, MessageRateState> = new Map();
  private skipPairs: Map<string, number> = new Map();


constructor(private io: Namespace) {
  setInterval(() => {
   logger.info(
  `Chat health status | queue=${this.queue.size()} | rooms=${this.roomManager.activeRoomCount()} | sockets=${this.io.sockets.size}`
);
  }, 30000);
}


  findMatch(socket: Socket): void {
    const socketId = socket.id;

    if (this.queue.hasUser(socketId)) return;
    if (this.queue.size() >= chatConfig.maxQueueSize) {
  const payload: ServerToClientPayloads["server_busy"] = {};
  socket.emit("server_busy", payload);
  return;
}

    const existingRoom = this.roomManager.getRoomBySocket(socketId);
    if (existingRoom) return;

    this.queue.addUser(socketId);

    let match = this.queue.findMatch();
    // Prevent tight-looping when only blocked pairs are available.
    let attempts = 0;
    const maxAttempts = Math.max(this.queue.size() + 1, 1);

    while (match && attempts < maxAttempts) {
      attempts++;
      const [user1, user2] = match;

      const pairKey = [user1, user2].sort().join("#");
      const blockUntil = this.skipPairs.get(pairKey);

      if (blockUntil) {
        if (blockUntil > Date.now()) {
          // Pair temporarily blocked
          this.queue.addUser(user1);
          this.queue.addUser(user2);
          match = this.queue.findMatch();
          continue;
        } else {
          // Expired block cleanup
          this.skipPairs.delete(pairKey);
        }
      }

      const room = this.roomManager.createRoom(user1, user2);

      this.io.sockets.get(user1)?.join(room.roomId);
      this.io.sockets.get(user2)?.join(room.roomId);

      const payload: ServerToClientPayloads["matched"] = {
        roomId: room.roomId,
      };

      this.io.to(room.roomId).emit("matched", payload);

      return;
    }
  }

  getRoomBySocket(socketId: SocketId): Room | null {
    return this.roomManager.getRoomBySocket(socketId);
  }

  getPartnerSocketId(socketId: SocketId): SocketId | null {
    const room = this.roomManager.getRoomBySocket(socketId);
    if (!room) return null;

    const [user1, user2] = room.users;
    return user1 === socketId ? user2 : user1;
  }

  // ===================== MESSAGE HANDLING =====================
handleMessage(socket: Socket, message: string): void {
  const socketId = socket.id;

  if (typeof message !== "string") return;

  const trimmed = message.trim();

  if (!trimmed) return;

  // Hard character limit safety
if (trimmed.length > chatConfig.maxMessageLength) {
    const payload: ServerToClientPayloads["message_error"] = {
      message: "Message too long.",
    };
    socket.emit("message_error", payload);
    return;
  }

  // Word limit check
  const wordCount = trimmed.split(/\s+/).length;

 if (wordCount > chatConfig.maxWords) {
    const payload: ServerToClientPayloads["message_error"] = {
      message: `Maximum ${chatConfig.maxWords} words allowed.`,
    };
    socket.emit("message_error", payload);
    return;
  }

  // ===== Rate limiting logic (already exists) =====
  const now = Date.now();
  let state = this.messageRateMap.get(socketId);

  if (!state) {
    state = { timestamps: [] };
    this.messageRateMap.set(socketId, state);
  }

  state.timestamps = state.timestamps.filter(
    (ts) => now - ts < chatConfig.messageWindow
  );

  if (state.timestamps.length >= chatConfig.messageLimit) {
    const payload: ServerToClientPayloads["rate_limited"] = {
      message: "You are sending messages too fast.",
    };
    socket.emit("rate_limited", payload);
    return;
  }

  state.timestamps.push(now);

  const room = this.roomManager.getRoomBySocket(socketId);
  if (!room) return;

  const payload: ServerToClientPayloads["message"] = {
    sender: socketId,
    message: trimmed,
    timestamp: now,
  };

  this.io.to(room.roomId).emit("message", payload);
}

  // ===================== SKIP =====================

  skip(socket: Socket): void {
    const socketId = socket.id;
    const now = Date.now();

    const state = this.userStates.get(socketId) || {};

    if (state.lastSkipAt && now - state.lastSkipAt < chatConfig.skipCooldown) {
      const payload: ServerToClientPayloads["skip_cooldown"] = {
        remaining: chatConfig.skipCooldown - (now - state.lastSkipAt),
      };
      socket.emit("skip_cooldown", payload);
      return;
    }

    state.lastSkipAt = now;
    this.userStates.set(socketId, state);

    const room = this.roomManager.getRoomBySocket(socketId);

    if (!room) {
      this.findMatch(socket);
      return;
    }

    const [user1, user2] = room.users;
    const partnerId = user1 === socketId ? user2 : user1;

    // Block pair temporarily
    const pairKey = [user1, user2].sort().join("#");
    this.skipPairs.set(pairKey, Date.now() + chatConfig.skipBlockTime);

    this.roomManager.removeRoom(room.roomId);

    const skippedPayload: ServerToClientPayloads["partner_skipped"] = {};
    this.io.to(partnerId).emit("partner_skipped", skippedPayload);

    const partnerSocket = this.io.sockets.get(partnerId);
    if (partnerSocket) this.findMatch(partnerSocket);

    this.findMatch(socket);
  }

  // ===================== DISCONNECT =====================

  handleDisconnect(socket: Socket): void {
    const socketId = socket.id;

    this.queue.removeUser(socketId);
    this.userStates.delete(socketId);
    this.messageRateMap.delete(socketId);

    const room = this.roomManager.getRoomBySocket(socketId);
    if (!room) return;

    const [user1, user2] = room.users;
    const partnerId = user1 === socketId ? user2 : user1;

    this.roomManager.removeRoom(room.roomId);

    const disconnectedPayload: ServerToClientPayloads["partner_disconnected"] =
      {};
    this.io.to(partnerId).emit("partner_disconnected", disconnectedPayload);

    const partnerSocket = this.io.sockets.get(partnerId);
    if (partnerSocket) {
      this.findMatch(partnerSocket);
    }
  }
}
