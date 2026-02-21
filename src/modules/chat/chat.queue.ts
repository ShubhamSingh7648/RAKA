import { QueueUser, SocketId } from "./chat.types";

export class MatchQueue {
  private queue: Map<SocketId, QueueUser> = new Map();

  addUser(socketId: SocketId): void {
    if (this.queue.has(socketId)) return;

    this.queue.set(socketId, {
      socketId,
      joinedAt: Date.now(),
    });
  }

  removeUser(socketId: SocketId): void {
    this.queue.delete(socketId);
  }

  findMatch(): [SocketId, SocketId] | null {
    const users = Array.from(this.queue.values());

    if (users.length < 2) return null;

    const user1 = users[0];
    const user2 = users[1];

    this.queue.delete(user1.socketId);
    this.queue.delete(user2.socketId);

    return [user1.socketId, user2.socketId];
  }

  hasUser(socketId: SocketId): boolean {
    return this.queue.has(socketId);
  }

  size(): number {
    return this.queue.size;
  }
}