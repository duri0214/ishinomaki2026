export type Conversation = {
  id: string;
  peer: {
    id: string;
    username: string | null;
    displayName: string;
    deleted: boolean;
  };
};

export type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type ConversationSummary = Conversation & { latest: Message };

export type MessagePage = {
  conversation: Conversation;
  messages: Message[];
  nextCursor: string | null;
};

/** 通知の確認では本文やユーザー情報を取得しない。 */
export type MessageNotification = {
  conversationId: string;
  latestMessageId: string;
  latestIncomingId: string | null;
  unreadCount: number;
};

export type MessageNotifications = {
  viewerId: string;
  conversations: MessageNotification[];
};
