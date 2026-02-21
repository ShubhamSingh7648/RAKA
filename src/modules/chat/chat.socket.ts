import { Server, Socket } from "socket.io";
import { ChatService } from "./chat.service";

export const registerChatHandlers = (io: Server) => {
  const chatNamespace = io.of("/chat");

  const chatService = new ChatService(chatNamespace);

  const broadcastOnlineCount = () => {
    const onlineCount = chatNamespace.sockets.size;

    chatNamespace.emit("online_count", {
      count: onlineCount,
    });
  };

  chatNamespace.on("connection", (socket: Socket) => {
    console.log("Chat socket connected:", socket.id);

    broadcastOnlineCount();

    socket.on("find_match", () => {
      chatService.findMatch(socket);
    });

    socket.on("message", (message: string) => {
      chatService.handleMessage(socket, message);
    });

    socket.on("skip", () => {
      chatService.skip(socket);
    });

    socket.on("disconnect", () => {
      chatService.handleDisconnect(socket);
      broadcastOnlineCount();
    });
  });
};