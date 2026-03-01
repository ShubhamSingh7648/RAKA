export interface PrivateErrorPayload {
  message: string;
  statusCode: number;
}

export interface PrivateServerToClientPayloads {
  private_chat_opened: {
    conversationId: string;
    roomId: string;
  };
  private_message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    createdAt: number;
    readBy: string[];
  };
  private_messages_loaded: {
    conversationId: string;
    messages: Array<{
      id: string;
      senderId: string;
      content: string;
      createdAt: number;
      readBy: string[];
    }>;
    nextCursor: string | null;
    partnerProfile: {
      userId: string;
      username: string;
      displayPicture: string;
    } | null;
  };
  private_conversations_listed: {
    conversations: Array<{
      conversationId: string;
      participantUserIds: string[];
      participantProfiles: Array<{
        userId: string;
        username: string;
      }>;
      lastMessage: {
        senderId: string;
        content: string;
        createdAt: number;
      } | null;
      updatedAt: number;
      isActive: boolean;
    }>;
  };
  private_message_read: {
    conversationId: string;
    messageId: string;
    readerId: string;
  };
  delete_private_conversation_success: {
    conversationId: string;
  };
  blocked_users_listed: {
    users: Array<{
      userId: string;
      username: string;
      blockedAt: number;
    }>;
  };
  user_blocked: {
    blockedUserId: string;
  };
  user_unblocked: {
    unblockedUserId: string;
  };
  typing: {
    conversationId: string;
    userId: string;
  };
  stopped_typing: {
    conversationId: string;
    userId: string;
  };
  private_presence: {
    conversationId: string;
    userId: string;
    isOnline: boolean;
  };
  private_error: PrivateErrorPayload;
}

export interface PrivateClientToServerPayloads {
  open_private_chat: {
    friendUserId: string;
  };
  send_private_message: {
    conversationId: string;
    content: string;
  };
  load_private_messages: {
    conversationId: string;
    cursor?: string;
    limit?: number;
  };
  list_private_conversations: {
    limit?: number;
  } | undefined;
  mark_read: {
    conversationId: string;
    messageId: string;
  };
  delete_private_conversation: {
    conversationId: string;
  };
  list_blocked_users: {
    limit?: number;
  } | undefined;
  block_user: {
    userId: string;
  };
  unblock_user: {
    userId: string;
  };
  typing: {
    conversationId: string;
  };
  stopped_typing: {
    conversationId: string;
  };
}
