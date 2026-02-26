# Implementation Order — Dependency-Aware Plan

## How to read this document

Every step lists:
- **Files touched** — exactly which files will be created or modified
- **Depends on** — which previous steps must be done first
- **Aware of** — which previous step changed a shared file, and what to NOT overwrite
- **Resolves** — which issue IDs from the master list this step closes

Steps are grouped into phases. Each phase is safe to implement as a unit.
Never skip a step and come back to it — the file references will be stale.

---

## PHASE 1 — Pure Backend Fixes (No frontend files touched at all)

These are completely isolated to the server codebase. Do these first because
they have zero overlap with each other or with the frontend. Once done, they
will not need to be revisited even after the entire frontend is rewritten.

---

### STEP 1 — Fix real-time private message delivery

- **Resolves:** BUG-01
- **Files touched:** `src/modules/private/private.socket.ts` only
- **Depends on:** Nothing. This is the very first change.
- **Aware of:** Nothing has been changed yet.
- **What to do:** Inside the `load_private_messages` handler, after
  `privateService.loadPrivateMessages(...)` resolves and before emitting
  `private_messages_loaded`, add one line:
  `socket.join(privateService.getRoomId(conversationId))`.
  This ensures the socket subscribes to the room and will receive future
  messages. Do not touch any other handler in this file.

---

### STEP 2 — Fix XSS-unsafe innerHTML in friend request handling (backend contract side)

- **Resolves:** Part of BUG-03 (the backend contract part — ensuring username is sanitized before it ever leaves the server)
- **Files touched:** `src/modules/user/user.model.ts`, `src/modules/auth/auth.validation.ts`
- **Depends on:** Nothing (STEP 1 touched a different file entirely).
- **Aware of:** STEP 1 only touched `private.socket.ts` — no overlap here.
- **What to do:** In `auth.validation.ts`, add a regex to the `username` field
  in `registerSchema` that explicitly rejects any HTML special characters:
  `.regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, underscores, dots, and hyphens")`.
  This prevents `<script>` tags from ever being stored as usernames.
  The frontend XSS fix (using `textContent` instead of `innerHTML`) will be
  handled later in STEP 6 when we rewrite the frontend entirely. This step is
  the backend half of the same fix.

---

### STEP 3 — Add rate limiting to auth endpoints

- **Resolves:** EDGE-01
- **Files touched:** `src/modules/auth/auth.routes.ts` only, plus `package.json` for the new dependency
- **Depends on:** Nothing.
- **Aware of:** STEP 2 touched `auth.validation.ts` — a different file in the
  same auth module folder. `auth.routes.ts` has not been touched yet.
- **What to do:** Run `npm install express-rate-limit`. In `auth.routes.ts`,
  import `rateLimit` from `express-rate-limit`. Create two limiters:
  a strict one (`max: 5, windowMs: 15 * 60 * 1000`) for `/login` and
  a slightly looser one (`max: 3, windowMs: 60 * 60 * 1000`) for `/register`.
  Apply them as middleware before the existing `validate` and controller calls.
  Do not change anything else in the file.

---

### STEP 4 — Fix chat.socket.ts: two bugs in the same file (do together)

- **Resolves:** BUG-06 (friend_request_accepted emits to closed room) + EDGE-07 (find_match rejects callbacks)
- **Files touched:** `src/modules/chat/chat.socket.ts` only
- **Depends on:** Nothing. Steps 1-3 touched completely different files.
- **Aware of:** Nothing in this file has been changed yet.
- **What to do — BUG-06 fix:** In the `accept_friend_request` handler,
  immediately after `const room = chatService.getRoomBySocket(socket.id)`,
  add `const savedRoomId = room.roomId` to capture the room ID before
  `closeRoomBySocket` is called. Replace all later references to `room.roomId`
  with `savedRoomId`. After emitting `friend_request_accepted`, call
  `socket.leave(savedRoomId)` and `partnerSocket.leave(savedRoomId)` explicitly.
- **What to do — EDGE-07 fix:** In the `find_match` handler, change the
  payload check from `typeof payload !== "undefined"` to
  `typeof payload !== "undefined" && typeof payload !== "function"`.
  This is a one-line change. Do not modify anything else in the handler.

---

### STEP 5 — Fix SocketIdentity TypeScript type

- **Resolves:** ARCH-03
- **Files touched:** `src/modules/chat/chat.types.ts` only
- **Depends on:** Nothing.
- **Aware of:** STEP 4 touched `chat.socket.ts` which imports from `chat.types.ts`
  but the import itself is not changing — only the type definition is expanding.
  The change is additive (adding a `username` field) so it will not break anything
  that STEP 4 already fixed in `chat.socket.ts`.
- **What to do:** Add `username: string` to the user variant of `SocketIdentity`.
  Also extend the Socket.IO `Socket` type with declaration merging by adding an
  `interface SocketData { identity: SocketIdentity }` declaration, then update
  the Server/Socket generic parameters in `chat.socket.ts` to use it. This will
  surface any remaining type errors in `chat.socket.ts` — fix those as they appear,
  being careful not to undo the BUG-06 or EDGE-07 fixes from STEP 4.

---

### STEP 6 — Add refresh token system to backend

- **Resolves:** BUG-04 (backend half only — the frontend half comes later in STEP 9)
- **Files touched:** `src/utils/jwt/jwt.ts`, `src/modules/auth/auth.service.ts`,
  `src/modules/auth/auth.controller.ts`, `src/router/v1/index.router.ts`
- **Depends on:** STEP 3 (which touched `auth.routes.ts` — this step touches
  `auth.service.ts` and `auth.controller.ts` in the same module, so do STEP 3 first
  to ensure the routes file is in its final state before we extend the service).
- **Aware of:** STEP 2 touched `auth.validation.ts` in the same folder —
  do not accidentally overwrite that file. STEP 3 added rate limiters to
  `auth.routes.ts` — when this step adds the new `/refresh` route, preserve
  the existing rate limiters on `/login` and `/register`.
- **What to do:** In `jwt.ts`, add `generateRefreshToken(userId)` with
  `expiresIn: "7d"` and `verifyRefreshToken(token)`. In `auth.service.ts`,
  update `registerUser` and `loginUser` to return both `accessToken` and
  `refreshToken`. In `auth.controller.ts`, set the refresh token as an
  `httpOnly, secure, sameSite: 'strict'` cookie in the response and add a
  new `refreshToken` controller function that reads the cookie, verifies it,
  and issues a new access token. In `index.router.ts`, add
  `POST /auth/refresh` pointing to the new controller. Change the access token
  expiry from `"15m"` to `"15m"` — keep it short now that refresh works.

---

## PHASE 2 — The Big Frontend Rewrite (chat-window.html → React)

This is the most impactful phase. It eliminates the iframe architecture entirely.
All steps in this phase touch the React frontend only. No backend files are touched.
Complete ALL steps in this phase before moving to Phase 3.

---

### STEP 7 — Create the useChatSocket hook (the brain of anonymous chat)

- **Resolves:** Part of ARCH-02, CONV-01, CONV-04 (swipe gesture hook)
- **Files touched:** Creates new files only:
  `my-project/src/hooks/useChatSocket.ts` (new),
  `my-project/src/hooks/useSwipeToSkip.ts` (new),
  `my-project/src/hooks/useToast.ts` (new)
- **Depends on:** All of Phase 1 must be complete. The hook will connect to
  the same backend that was fixed in Steps 1-6.
- **Aware of:** No existing files are being modified in this step — only new
  files are created. There is nothing to accidentally overwrite.
- **What to do:** Extract ALL socket logic from `chat-window.html` into
  `useChatSocket.ts`. The hook should:
  - Create the Socket.IO connection to `/chat` on mount, disconnect on unmount
  - Accept the JWT token as a parameter and call `upgrade_identity` on connect
  - Manage state: `status`, `statusMode`, `messages`, `matched`, `roomId`,
    `onlineCount`, `skipCooldown`, `friendReqState`
  - Expose functions: `findMatch()`, `sendMessage(text)`, `skip()`,
    `sendFriendRequest()`, `acceptFriendRequest(requestId)`
  - Handle all socket events: `matched`, `message`, `partner_skipped`,
    `partner_disconnected`, `skip_cooldown`, `rate_limited`, `online_count`,
    `identity_upgraded`, `friend_request_message`, `friend_request_accepted`,
    `private_chat_started`
  - Return all state and functions as a typed object
  In `useSwipeToSkip.ts`, extract the touchstart/touchmove/touchend logic
  from `chat-window.html` as a hook that takes an `onSwipe` callback and
  attaches to a provided `containerRef`.
  In `useToast.ts`, create a toast queue manager with `addToast(message, type, duration)`
  that returns a `toasts` array for rendering.

---

### STEP 8 — Create the anonymous chat React component tree

- **Resolves:** ARCH-02 fully, CONV-01, CONV-02, CONV-03, BUG-03 (XSS — React
  escapes all JSX expressions by default), ARCH-01 (no more URL token), EDGE-04
  (smart auto-scroll), EDGE-08 (proper button state management)
- **Files touched:** Creates new files:
  `my-project/src/components/anonymous/AnonymousChat.tsx` (new),
  `my-project/src/components/anonymous/AnonymousStatusBar.tsx` (new),
  `my-project/src/components/anonymous/AnonymousMessageList.tsx` (new),
  `my-project/src/components/anonymous/AnonymousChatInput.tsx` (new),
  `my-project/src/components/shared/MessageBubble.tsx` (new),
  `my-project/src/components/shared/SystemMessage.tsx` (new),
  `my-project/src/components/shared/Toast.tsx` (new)
  Modifies existing:
  `my-project/src/components/ChatWindow.tsx` (replaces iframe with AnonymousChat)
- **Depends on:** STEP 7 must be complete — all new components consume `useChatSocket`.
- **Aware of:** `ChatWindow.tsx` currently renders an `<iframe>`. We are
  replacing the entire body of this component. The `token` from `useAuth()`
  is already imported there — keep that import, pass `token` directly to
  `useChatSocket(token)` instead of appending it to an iframe URL.
  The `src` variable and the `<iframe>` JSX are deleted entirely.
- **What to do for ARCH-01 (JWT URL):** Since we now pass `token` directly
  as a prop to the hook (no iframe, no URL), this vulnerability is gone
  automatically. No separate fix needed.
- **What to do for BUG-03 (XSS):** In `AnonymousMessageList.tsx`, render the
  friend request UI using JSX — `<strong>{data.from.username}</strong>` etc.
  React's JSX engine escapes all `{}` expressions. Never use
  `dangerouslySetInnerHTML`. The `acceptFriendRequest` call uses a click
  handler on the button element, not an `onclick` string attribute.
- **What to do for EDGE-04 (auto-scroll):** In `AnonymousMessageList.tsx`,
  before calling `messagesEndRef.current?.scrollIntoView()`, check:
  `const isNearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80`.
  Only scroll if true, or if the latest message is from the current user.
- **CSS tokens (CONV-03):** Replicate the CSS custom properties from
  `chat-window.html` as Tailwind arbitrary values or add them to
  `tailwind.config.js` under `extend.colors`. Keep the dark theme consistent.

---

### STEP 9 — Update AppLayout to remove the postMessage bridge and wire anonymousActive

- **Resolves:** CONV-02 (remove postMessage bridge), BUG-05 (sidebar delete can
  now be properly wired), ARCH-07 (auth loading flash — add isLoading here)
- **Files touched:** `my-project/src/components/AppLayout.tsx` only
- **Depends on:** STEP 8 must be complete. `AnonymousChat.tsx` now exists and
  emits state via props/callbacks instead of `postMessage`.
- **Aware of:** `AppLayout.tsx` currently has:
  1. A `window.addEventListener('message', onBridgeMessage)` handler — DELETE this
  2. A `window.addEventListener('private-conversations:refresh', ...)` handler — KEEP this, it is still used by PrivateChat
  3. `<LeftSidebar>` without `onDeleteConversation` — WIRE this up now
  4. `<RightSidebar>` without `onEditProfile` — leave for STEP 14 (profile edit)
  None of the backend changes from Phase 1 affect this file.
- **What to do:** Remove the entire `onBridgeMessage` function and its
  `window.addEventListener('message', ...)` / `removeEventListener` calls.
  The `anonymousActive` state is now driven by a callback from `AnonymousChat`:
  add `onMatchChange={(isMatched) => setAnonymousActive(isMatched)}` as a prop
  on `<ChatWindow />` (which renders `<AnonymousChat />`). For `onDeleteConversation`,
  create a handler that emits `delete_private_conversation` via the private socket
  instance that is already managed in this component — call
  `privateSocket.emit('delete_private_conversation', { conversationId })` and then
  `refreshPrivateConversations(privateSocket)`.

---

### STEP 10 — Update AuthContext: remove polling, add isLoading, integrate refresh token

- **Resolves:** EDGE-05 (remove 1-second polling), ARCH-07 (add isLoading),
  BUG-04 frontend half (silent refresh on 401)
- **Files touched:** `my-project/src/context/AuthContext.tsx` only
- **Depends on:** STEP 6 (backend refresh endpoint must exist before the
  frontend can call it). STEP 9 must also be complete because `AppLayout.tsx`
  was modified in STEP 9 and it renders the children that depend on auth state.
- **Aware of:** Nothing in Phase 1 or Phase 2 touched `AuthContext.tsx`.
  This file has not been modified yet — start from the current version.
- **What to do — EDGE-05:** Delete the `window.setInterval(syncToken, 1000)` line
  and its corresponding `clearInterval` in the cleanup. The storage, focus,
  and visibilitychange listeners are sufficient.
- **What to do — ARCH-07:** Add `const [isLoading, setIsLoading] = useState(true)`.
  In `refreshProfile`, after the `fetchMe` call resolves (success or failure),
  set `setIsLoading(false)`. Add `isLoading` to the context value. In `App.tsx`,
  wrap the `<Routes>` in `if (isLoading) return <FullScreenLoader />`.
- **What to do — BUG-04 frontend:** Create a `silentRefresh()` async function
  that calls `POST /api/v1/auth/refresh` (the endpoint built in STEP 6).
  On success, save the new access token to localStorage and update state.
  On failure, call `clearStoredAuth()`. Wrap `fetchMe` in a try-catch that
  calls `silentRefresh()` on a 401 response before giving up. Add a fetch
  interceptor pattern that retries once with a refreshed token.

---

### STEP 11 — Delete chat-window.html

- **Resolves:** Closes out ARCH-02 completely. Removes dead code.
- **Files touched:** Deletes `my-project/public/chat-window.html`
- **Depends on:** STEPS 7, 8, 9, 10 must ALL be complete and tested.
  Every feature that was in `chat-window.html` must be verified working in
  the new React components before this file is deleted.
- **Aware of:** After deletion, `vite.config.ts` or any static file serving
  config that explicitly references `chat-window.html` should also be cleaned
  up. Check that no import or reference to this file remains anywhere.
- **What to do:** Delete the file. Run the app. Verify anonymous chat works
  end-to-end: find match, send message, skip, add friend, accept friend.
  If anything is broken, the React implementation is incomplete — fix it
  before proceeding to Phase 3.

---

## PHASE 3 — PrivateChat.tsx Consolidation (Fix all PrivateChat bugs in one pass)

All of these touch `PrivateChat.tsx`. Do them in one editing session to avoid
merge conflicts with yourself.

---

### STEP 12 — Refactor PrivateChat.tsx: socket lifecycle, mark_read, pagination, word count

- **Resolves:** EDGE-02 (socket reconnect on nav), EDGE-06 (mark_read spam),
  FEAT-04 (message pagination), FEAT-07 (word count in private chat)
- **Files touched:** `my-project/src/components/PrivateChat.tsx` only
- **Depends on:** STEP 10 must be complete — `AuthContext` now has `isLoading`
  which `PrivateChat` may need to check before rendering. STEP 1 (backend fix)
  must be complete so `socket.join(roomId)` now correctly happens on the backend
  when messages are loaded.
- **Aware of:** STEP 9 changed `AppLayout.tsx` which is the parent of
  `PrivateChat`. The `onDeleteConversation` was wired in STEP 9, so do not
  add socket-based deletion logic inside `PrivateChat` that would conflict —
  the deletion is now handled at the `AppLayout` level.
- **What to do — EDGE-02:** Split the single `useEffect` into two separate effects.
  Effect 1 (socket creation): depends only on `[token]`. Creates the socket,
  sets up all event listeners, stores socket in a `useRef` (not useState, to avoid
  re-renders). Effect 2 (conversation join): depends on `[routeConversationId]`.
  Emits `load_private_messages` using the socket ref. Remove `navigate` from all
  dependency arrays — it is stable and does not need to be listed.
- **What to do — EDGE-06:** Create a `markedReadRef = useRef(new Set<string>())`.
  In the mark_read effect, before emitting, check
  `if (markedReadRef.current.has(m.id)) return`. After emitting, add the ID
  to the Set. Reset the Set in Effect 2 when `routeConversationId` changes.
- **What to do — FEAT-04:** Add `nextCursor` to component state. When
  `private_messages_loaded` fires, save `nextCursor` from the payload. Add an
  `IntersectionObserver` on a sentinel `<div>` at the top of the message list
  that fires `socket.emit('load_private_messages', { conversationId, cursor: nextCursor })`
  when intersected. Prepend (not append) returned messages to the existing array.
  Hide the sentinel when `nextCursor` is `null`.
- **What to do — FEAT-07:** Add a word count display below the textarea.
  Count words with `input.trim().split(/\s+/).filter(Boolean).length`.
  Show `X / 30 words` in a small muted label. Turn red when over 25 words.
  Disable the send button when word count exceeds 30. Import `chatConfig.maxWords`
  or hardcode 30 to match the backend value. (Consider creating a shared
  `src/config/chat.config.ts` in the frontend that mirrors the backend config.)

---

## PHASE 4 — New Features (Each builds on the stable base from Phases 1-3)

---

### STEP 13 — Add friends list: backend endpoint + frontend page

- **Resolves:** BUG-02 (users stuck after deleting private chat), FEAT-01
- **Files touched:**
  Backend: `src/router/v1/index.router.ts`, `src/modules/friend/friend.service.ts`
  Frontend: `my-project/src/components/FriendsList.tsx` (new),
  `my-project/src/App.tsx`
- **Depends on:** Phase 1 and Phase 2 must be complete.
- **Aware of:** `index.router.ts` was touched in STEP 6 where `/auth/refresh` was added.
  When adding the new `/friends` route, preserve the existing `/me` and all `/auth/*`
  routes. Do not reorder or remove anything that was added in STEP 6.
  `App.tsx` has not been touched in any previous step — start from its current state.
- **What to do — backend:** In `friend.service.ts`, add `listFriends(userId, limit)` that
  queries `Friend.find({ user: userId }).populate('friend', '_id username').lean()`.
  In `index.router.ts`, add `GET /api/v1/friends` with the `authenticate` middleware
  calling the new service function.
- **What to do — frontend:** Create `FriendsList.tsx` that fetches `/api/v1/friends`
  with the JWT and renders each friend with their username and an "Open Chat" button.
  The "Open Chat" button navigates to `/chat/private?friendUserId=<id>` — the existing
  `PrivateChat.tsx` already handles this via `searchParams.get('friendUserId')`.
  In `App.tsx`, add a `/chat/friends` route inside the `AppLayout` route group,
  protected by the `ProtectedPrivateRoute` wrapper that already exists.
  In `LeftSidebar.tsx`, add a "Friends" section or a navigation link to `/chat/friends`.

---

### STEP 14 — Profile edit: modal + backend endpoint

- **Resolves:** ARCH-06 (Edit Profile button wired to nothing)
- **Files touched:**
  Backend: `src/router/v1/index.router.ts`, `src/modules/user/user.model.ts`
  Frontend: `my-project/src/components/ProfileEditModal.tsx` (new),
  `my-project/src/components/AppLayout.tsx`,
  `my-project/src/components/RightSidebar.tsx`
- **Depends on:** STEP 13 must be complete because it also touches `index.router.ts`.
  Doing STEP 14 after STEP 13 means you edit `index.router.ts` once more, adding
  the `PATCH /me` route while keeping all the routes from STEPS 6 and 13.
- **Aware of:** `AppLayout.tsx` was modified in STEP 9 (removed postMessage bridge,
  wired delete). When adding `onEditProfile` to `<RightSidebar>`, do NOT remove
  the `onDeleteConversation` wiring that was added in STEP 9.
  `user.model.ts` was NOT touched in any previous step — start from the current version.
- **What to do — backend:** Add optional `bio` and `displayPicture` string fields to
  `IUser` in `user.model.ts`. Add `PATCH /api/v1/me` in `index.router.ts` with
  `authenticate` middleware that accepts `{ username?, bio? }` and calls
  `User.findByIdAndUpdate(req.user.userId, ...)`.
- **What to do — frontend:** Create `ProfileEditModal.tsx` with inputs for username
  and bio, a save button that calls `PATCH /api/v1/me`, and on success calls
  `refreshProfile()` from `useAuth()`. In `AppLayout.tsx`, add
  `const [showProfileEdit, setShowProfileEdit] = useState(false)` and pass
  `onEditProfile={() => setShowProfileEdit(true)}` to `<RightSidebar>`.
  Render `<ProfileEditModal />` conditionally.

---

### STEP 15 — Add typing indicator

- **Resolves:** FEAT-03
- **Files touched:**
  Backend: `src/modules/chat/chat.socket.ts`, `src/modules/chat/chat.contracts.ts`,
  `src/modules/private/private.socket.ts`, `src/modules/private/private.contracts.ts`
  Frontend: `my-project/src/hooks/useChatSocket.ts`,
  `my-project/src/components/anonymous/AnonymousChatInput.tsx`,
  `my-project/src/components/anonymous/AnonymousMessageList.tsx`,
  `my-project/src/components/PrivateChat.tsx`
- **Depends on:** STEP 7 (useChatSocket exists), STEP 12 (PrivateChat.tsx is in
  its final refactored state). Do not start this step until STEP 12 is done —
  adding typing events to the old PrivateChat.tsx would be wasted work.
- **Aware of:** `chat.socket.ts` was modified in STEP 4 (BUG-06 and EDGE-07 fixes)
  and in STEP 5 (type updates). When adding typing handler, preserve all those fixes.
  `chat.contracts.ts` was NOT touched in any previous step.
  `useChatSocket.ts` was created in STEP 7 — extend it here, do not recreate it.
  `PrivateChat.tsx` was refactored in STEP 12 — extend it here, do not recreate it.
- **What to do — backend:** Add `typing` and `stopped_typing` to both
  `ServerToClientPayloads` and `ClientToServerPayloads` in `chat.contracts.ts`
  and `private.contracts.ts`. In `chat.socket.ts`, add handlers for both events
  that relay to the room partner. In `private.socket.ts`, do the same for the
  private room. No database operations needed — purely ephemeral relay.
- **What to do — frontend anonymous:** In `useChatSocket.ts`, add debounced
  `typing` emit on input (emit once, then suppress for 2 seconds, then re-enable).
  Add `isPartnerTyping` boolean to hook state, set by incoming `typing` event with
  a 3-second auto-clear timeout. Expose `isPartnerTyping` from the hook.
  In `AnonymousMessageList.tsx`, show "Stranger is typing…" when `isPartnerTyping` is true.
  In `AnonymousChatInput.tsx`, emit `typing` on textarea input changes.
- **What to do — frontend private:** In `PrivateChat.tsx`, add the same typing
  emit and `isPartnerTyping` state. Show "typing…" below the chat header when true.

---

### STEP 16 — Add unread counts to private conversations

- **Resolves:** EDGE-03
- **Files touched:**
  Backend: `src/modules/private/private.service.ts`
  Frontend: `my-project/src/components/AppLayout.tsx`
- **Depends on:** STEP 12 must be complete — unread counts depend on the
  `mark_read` logic being correct (fixed in STEP 12). STEP 9 is also a prerequisite
  since `AppLayout.tsx` is being modified.
- **Aware of:** `AppLayout.tsx` was modified in STEP 9 and STEP 14.
  When updating the `mapped` array in this step, preserve all changes from
  both previous modifications. `private.service.ts` was NOT touched in any
  previous step — start from its current state.
- **What to do — backend:** In `listPrivateConversations`, after fetching conversations,
  for each conversation run:
  `Message.countDocuments({ conversationId, senderId: { $ne: userId }, readBy: { $nin: [userId] } })`
  (use `Promise.all` to run these in parallel). Return the count as `unreadCount`
  in the conversation payload.
- **What to do — frontend:** In `AppLayout.tsx`, in the `mapped` array inside
  `private_conversations_listed` handler, replace `unreadCount: 0` with
  `unreadCount: conversation.unreadCount ?? 0` (using the new backend field).

---

### STEP 17 — Add ErrorBoundary

- **Resolves:** ARCH-04
- **Files touched:** `my-project/src/components/ErrorBoundary.tsx` (new),
  `my-project/src/main.tsx`
- **Depends on:** Nothing specific — but do this after Phase 2 is complete
  because the component tree it wraps is in its final structure by then.
- **Aware of:** `main.tsx` has not been touched in any previous step.
  Start from the current version.
- **What to do:** Create `ErrorBoundary.tsx` as a class component implementing
  `componentDidCatch` and `getDerivedStateFromError`. Render a fallback UI
  with the app logo, a friendly error message, and a "Reload App" button that
  calls `window.location.reload()`. In `main.tsx`, wrap `<AuthProvider><App /></AuthProvider>`
  with `<ErrorBoundary>`.

---

### STEP 18 — Add mobile navigation

- **Resolves:** ARCH-05
- **Files touched:** `my-project/src/components/AppLayout.tsx` only
- **Depends on:** STEP 14 must be complete because `AppLayout.tsx` was last
  modified there. This is the final modification to `AppLayout.tsx`.
- **Aware of:** `AppLayout.tsx` has been modified in STEPS 9, 14, and 16.
  This is the fourth and final edit to this file. Preserve ALL previous changes:
  - STEP 9: removed postMessage bridge, wired delete, added `onMatchChange` callback
  - STEP 14: added `showProfileEdit` state and `onEditProfile` handler
  - STEP 16: no changes to AppLayout in that step (backend only + AppLayout's mapped array)
  Do not remove or restructure any of this when adding mobile nav.
- **What to do:** Add `const [sidebarOpen, setSidebarOpen] = useState(false)`.
  Change the left sidebar container from `hidden md:block` to a conditional that
  shows it as a fixed overlay drawer on mobile (using `translate-x-full` /
  `translate-x-0` transition) and as a static sidebar on `md:`. Add a hamburger
  button in the mobile header. Pass `onClose={() => setSidebarOpen(false)}` to
  `<LeftSidebar>` — this prop already exists in `LeftSidebar.tsx`.
  Add a bottom tab bar for mobile with three tabs: Anonymous Chat, Private Chats,
  Friends (linking to the routes from STEPS 9, 12, and 13 respectively).

---

## PHASE 5 — Final Polish (No further structural changes)

---

### STEP 19 — Online presence in private chats

- **Resolves:** FEAT-05
- **Files touched:** Backend: `src/modules/private/private.socket.ts`,
  `src/modules/private/private.contracts.ts`
  Frontend: `my-project/src/components/PrivateChat.tsx`
- **Depends on:** STEP 15 (typing indicator) must be complete because both
  this step and STEP 15 modify `private.socket.ts` and `PrivateChat.tsx`.
  Doing this step after means you extend those files rather than conflicting.
- **Aware of:** `private.socket.ts` was touched in STEP 1 (added socket.join)
  and STEP 15 (added typing relay). Preserve both those changes. `PrivateChat.tsx`
  was refactored in STEP 12 and extended in STEP 15. Extend it again here
  without removing the pagination (STEP 12), mark_read dedup (STEP 12),
  or typing indicator (STEP 15) logic.

---

### STEP 20 — Profile pictures (upload + display)

- **Resolves:** FEAT-06
- **Files touched:** Backend: `src/modules/user/user.model.ts`, `src/router/v1/index.router.ts`
  Frontend: `my-project/src/components/ProfileEditModal.tsx`,
  `my-project/src/context/AuthContext.tsx`
- **Depends on:** STEP 14 (profile edit modal exists), STEP 10 (AuthContext is stable).
- **Aware of:** `user.model.ts` was modified in STEP 14 to add `bio` and `displayPicture`.
  Do not re-declare those fields. `index.router.ts` was modified in STEPS 6 and 13.
  Add the upload endpoint without removing those.
  `AuthContext.tsx` was modified in STEP 10. Add `displayPicture` to `AuthUser` type
  without removing the `isLoading` state or `silentRefresh` logic from STEP 10.
  `ProfileEditModal.tsx` was created in STEP 14. Add file input to the existing modal form.

---

## QUICK REFERENCE — File Modification Timeline

| File | Steps that touch it |
|------|---------------------|
| `private.socket.ts` | 1, 15, 19 |
| `auth.validation.ts` | 2 |
| `auth.routes.ts` | 3 |
| `chat.socket.ts` | 4, 5, 15 |
| `chat.types.ts` | 5 |
| `jwt.ts` | 6 |
| `auth.service.ts` | 6 |
| `auth.controller.ts` | 6 |
| `index.router.ts` (backend) | 6, 13, 14, 20 |
| `useChatSocket.ts` | 7 (create), 15 (extend) |
| `AnonymousChat.tsx` | 8 (create) |
| `ChatWindow.tsx` | 8 |
| `AppLayout.tsx` | 9, 14, 16, 18 |
| `AuthContext.tsx` | 10, 20 |
| `chat-window.html` | 11 (DELETE) |
| `PrivateChat.tsx` | 12, 15, 19 |
| `friend.service.ts` | 13 |
| `FriendsList.tsx` | 13 (create) |
| `App.tsx` | 13 |
| `user.model.ts` | 14, 20 |
| `ProfileEditModal.tsx` | 14 (create), 20 (extend) |
| `RightSidebar.tsx` | 14 |
| `chat.contracts.ts` | 15 |
| `private.contracts.ts` | 15, 19 |
| `private.service.ts` | 16 |
| `ErrorBoundary.tsx` | 17 (create) |
| `main.tsx` | 17 |

---

## GOLDEN RULE

Before starting any step, re-read the "Aware of" section and locate every
previous change in the file you are about to edit. Make your new changes
*additive* — extend what exists, never replace the whole file from scratch.
When in doubt, implement one logical change at a time and test before moving on.
