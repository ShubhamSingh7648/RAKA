import { Room, SocketId } from "./chat.types";

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<SocketId, string> = new Map();

  createRoom(
    user1: SocketId,
    user2: SocketId,
    conversationId?: string
  ): Room {
    const roomId = this.generateRoomId(user1, user2);

    const room: Room = {
      roomId,
      conversationId,
      users: [user1, user2],
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(user1, roomId);
    this.socketToRoom.set(user2, roomId);

    return room;
  }

  getRoomBySocket(socketId: SocketId): Room | null {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    return this.rooms.get(roomId) || null;
  }

  removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const [user1, user2] = room.users;

    this.socketToRoom.delete(user1);
    this.socketToRoom.delete(user2);
    this.rooms.delete(roomId);
  }

  removeSocket(socketId: SocketId): void {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;

    this.removeRoom(roomId);
  }

  private generateRoomId(user1: SocketId, user2: SocketId): string {
    return [user1, user2].sort().join("#");
  }

  activeRoomCount(): number {
    return this.rooms.size;
  }
}
