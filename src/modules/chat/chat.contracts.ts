export const SocketErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type SocketErrorCode =
  (typeof SocketErrorCodes)[keyof typeof SocketErrorCodes];

export interface SocketErrorPayload {
  code: SocketErrorCode;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export interface ServerToClientPayloads {
  online_count: { count: number };
  matched: { roomId: string };
  message: { sender: string; message: string; timestamp: number };
  partner_skipped: Record<string, never>;
  partner_disconnected: Record<string, never>;
  skip_cooldown: { remaining: number };
  rate_limited: { message: string };
  message_error: { message: string };
  server_busy: Record<string, never>;
  server_error: SocketErrorPayload;
  identity_upgraded: { success: boolean; message?: string };
  friend_error: SocketErrorPayload;
  friend_request_message: {
    type: "friend_request";
    requestId: string;
    fromUsername: string;
    from: {
      userId: string;
      username: string;
    };
  };
  friend_request_accepted: {
    requestId: string;
    acceptedBy: string;
    username: string;
  };
  private_chat_started: {
    conversationId: string;
    roomId: string;
    messages: Array<{
      id: string;
      senderId: string;
      content: string;
      createdAt: number;
    }>;
  };
}

export interface ClientToServerPayloads {
  find_match: undefined;
  message: string;
  skip: undefined;
  upgrade_identity: string;
  send_friend_request: undefined;
  accept_friend_request: string;
}
