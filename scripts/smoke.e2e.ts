import assert from "node:assert/strict";
import { io, Socket } from "socket.io-client";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const CHAT_SOCKET_URL = process.env.SOCKET_URL || "http://localhost:3001/chat";
const PRIVATE_SOCKET_URL =
  process.env.PRIVATE_SOCKET_URL || "http://localhost:3001/private";

type LoginResponse = {
  success: boolean;
  data: {
    user: {
      id: string;
      username: string;
      email: string;
    };
    accessToken: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForEvent = <T>(
  socket: Socket,
  eventName: string,
  timeoutMs = 8000
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for event: ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };

    socket.once(eventName, onEvent);
  });

async function matchPair(socketA: Socket, socketB: Socket) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    socketA.emit("find_match");
    socketB.emit("find_match");

    try {
      const [matchedA, matchedB] = await Promise.all([
        waitForEvent<{ roomId: string }>(socketA, "matched", 10000),
        waitForEvent<{ roomId: string }>(socketB, "matched", 10000),
      ]);

      if (matchedA.roomId === matchedB.roomId) {
        return matchedA.roomId;
      }

      socketA.emit("skip");
      socketB.emit("skip");
      await sleep(800);
    } catch {
      socketA.emit("skip");
      socketB.emit("skip");
      await sleep(800);
    }
  }

  throw new Error(
    "Could not match both test users together. Close other active chat clients and retry."
  );
}

async function registerAndLogin(prefix: string) {
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`;
  const password = "12345678";
  const username = `${prefix}_${Math.floor(Math.random() * 10000)}`;

  const registerRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, username }),
  });
  assert.equal(registerRes.ok, true, "register should succeed");

  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(loginRes.ok, true, "login should succeed");

  const loginData = (await loginRes.json()) as LoginResponse;
  assert.equal(loginData.success, true, "login response should be success");
  assert.ok(loginData.data.accessToken, "access token should be present");

  return {
    token: loginData.data.accessToken,
    userId: loginData.data.user.id,
    username,
  };
}

function connectClient(token: string) {
  return io(CHAT_SOCKET_URL, {
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
  });
}

function connectPrivateClient(token: string) {
  return io(PRIVATE_SOCKET_URL, {
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
  });
}

async function run() {
  console.log(`[SMOKE] Using BASE_URL=${BASE_URL}`);
  console.log(
    `[SMOKE] Chat namespace=${CHAT_SOCKET_URL}, Private namespace=${PRIVATE_SOCKET_URL}`
  );

  const user1 = await registerAndLogin("smoke_a");
  const user2 = await registerAndLogin("smoke_b");

  const socketA = connectClient(user1.token);
  const socketB = connectClient(user2.token);
  const privateSocketA = connectPrivateClient(user1.token);
  const privateSocketB = connectPrivateClient(user2.token);

  try {
    await Promise.all([
      waitForEvent(socketA, "connect"),
      waitForEvent(socketB, "connect"),
      waitForEvent(privateSocketA, "connect"),
      waitForEvent(privateSocketB, "connect"),
    ]);

    const roomId = await matchPair(socketA, socketB);
    assert.ok(roomId, "both sockets should match into one room");

    socketA.emit("send_friend_request");
    const reqMsg = await waitForEvent<{ requestId: string; fromUsername: string }>(
      socketB,
      "friend_request_message"
    );
    assert.ok(reqMsg.requestId, "friend request should include requestId");

    socketB.emit("accept_friend_request", reqMsg.requestId);

    const accepted = await waitForEvent<{ requestId: string }>(
      socketA,
      "friend_request_accepted"
    );
    assert.equal(
      accepted.requestId,
      reqMsg.requestId,
      "accepted request id should match sent request id"
    );

    privateSocketA.emit("open_private_chat", { friendUserId: user2.userId });
    const openedA = await waitForEvent<{
      conversationId: string;
      roomId: string;
    }>(privateSocketA, "private_chat_opened");

    privateSocketB.emit("open_private_chat", { friendUserId: user1.userId });
    const openedB = await waitForEvent<{
      conversationId: string;
      roomId: string;
    }>(privateSocketB, "private_chat_opened");

    assert.equal(
      openedA.conversationId,
      openedB.conversationId,
      "private conversation should be same for both users"
    );

    const privateMessagePromise = waitForEvent<{
      conversationId: string;
      senderId: string;
      content: string;
      createdAt: number;
    }>(privateSocketB, "private_message");

    privateSocketA.emit("send_private_message", {
      conversationId: openedA.conversationId,
      content: "hello private smoke",
    });

    const privateMessage = await privateMessagePromise;
    assert.equal(
      privateMessage.conversationId,
      openedA.conversationId,
      "private message should target opened conversation"
    );
    assert.equal(
      privateMessage.content,
      "hello private smoke",
      "private message content should match"
    );

    privateSocketB.emit("load_private_messages", {
      conversationId: openedA.conversationId,
      limit: 20,
    });
    const loaded = await waitForEvent<{
      conversationId: string;
      messages: Array<{ id: string; content: string }>;
      nextCursor: string | null;
    }>(privateSocketB, "private_messages_loaded");

    assert.equal(
      loaded.conversationId,
      openedA.conversationId,
      "loaded messages should belong to opened conversation"
    );
    assert.equal(
      loaded.messages.some((m) => m.content === "hello private smoke"),
      true,
      "loaded messages should include sent private message"
    );

    privateSocketA.emit("list_private_conversations", { limit: 10 });
    const listed = await waitForEvent<{
      conversations: Array<{ conversationId: string }>;
    }>(privateSocketA, "private_conversations_listed");
    assert.equal(
      listed.conversations.some(
        (conversation) => conversation.conversationId === openedA.conversationId
      ),
      true,
      "conversation list should include opened conversation"
    );

    console.log(
      "[SMOKE] PASS: random chat + friend accept + private open/send/load/list flow"
    );
  } finally {
    socketA.disconnect();
    socketB.disconnect();
    privateSocketA.disconnect();
    privateSocketB.disconnect();
    await sleep(100);
  }
}

run().catch((err) => {
  console.error("[SMOKE] FAIL:", err.message);
  console.error(
    "[SMOKE] Hint: run this with no other active chat clients to reduce matchmaking interference."
  );
  process.exit(1);
});
