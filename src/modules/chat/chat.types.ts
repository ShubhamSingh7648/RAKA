export type SocketId = string;

export interface QueueUser {
  socketId: SocketId;
  joinedAt: number;
}

export interface Room {
  roomId: string;
  users: [SocketId, SocketId];
  createdAt: number;
}

export interface MatchResult {
  roomId: string;
  users: [SocketId, SocketId];
}
export interface UserState {
  lastSkipAt?: number;
}
export interface MessageRateState {
  timestamps: number[];
}