import { Socket, Namespace } from "socket.io";
import { MatchQueue } from "./chat.queue";
import { RoomManager } from "./chat.room.manager";
import { MessageRateState, SocketId, UserState } from "./chat.types";

import { chatConfig } from "../../config/chat.config";

export class ChatService {
  private queue = new MatchQueue();
  private roomManager = new RoomManager();

  private userStates: Map<SocketId, UserState> = new Map();
  private messageRateMap: Map<SocketId, MessageRateState> = new Map();
  private skipPairs: Map<string, number> = new Map();


  constructor(private io: Namespace) {}



  findMatch(socket: Socket): void {
    const socketId = socket.id;

    if (this.queue.hasUser(socketId)) return;
    if (this.queue.size() >= chatConfig.maxQueueSize) {
  socket.emit("server_busy");
  return;
}

    const existingRoom = this.roomManager.getRoomBySocket(socketId);
    if (existingRoom) return;

    this.queue.addUser(socketId);

    let match = this.queue.findMatch();

    while (match) {
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

      this.io.to(room.roomId).emit("matched", {
        roomId: room.roomId,
      });

      return;
    }
  }

  // ===================== MESSAGE HANDLING =====================
handleMessage(socket: Socket, message: string): void {
  const socketId = socket.id;

  if (typeof message !== "string") return;

  const trimmed = message.trim();

  if (!trimmed) return;

  // Hard character limit safety
if (trimmed.length > chatConfig.maxMessageLength) {
    socket.emit("message_error", {
      message: "Message too long.",
    });
    return;
  }

  // Word limit check
  const wordCount = trimmed.split(/\s+/).length;

 if (wordCount > chatConfig.maxWords) {
    socket.emit("message_error", {
      message: `Maximum ${chatConfig.maxWords} words allowed.`,
    });
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
    socket.emit("rate_limited", {
      message: "You are sending messages too fast.",
    });
    return;
  }

  state.timestamps.push(now);

  const room = this.roomManager.getRoomBySocket(socketId);
  if (!room) return;

  this.io.to(room.roomId).emit("message", {
    sender: socketId,
    message: trimmed,
    timestamp: now,
  });
}

  // ===================== SKIP =====================

  skip(socket: Socket): void {
    const socketId = socket.id;
    const now = Date.now();

    const state = this.userStates.get(socketId) || {};

    if (state.lastSkipAt && now - state.lastSkipAt < chatConfig.skipCooldown) {
      socket.emit("skip_cooldown", {
        remaining: chatConfig.skipCooldown - (now - state.lastSkipAt),
      });
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

    this.io.to(partnerId).emit("partner_skipped");

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

    this.io.to(partnerId).emit("partner_disconnected");

    const partnerSocket = this.io.sockets.get(partnerId);
    if (partnerSocket) {
      this.findMatch(partnerSocket);
    }
  }
}