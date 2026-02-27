# New Implementation Order — Profile Pages, Logo, Friends Fix & Design

## What this plan covers

Based on the wireframe and your requests, this plan adds:
1. App logo throughout the UI
2. Own profile page (dedicated route, not just a modal)
3. Other user profile page (view any friend's public profile)
4. Fix the "Failed to load friends" error (root cause identified)
5. Design adjustments to match your wireframe: avatar circles, bottom nav redesign (Home / Chats / You), visual polish

**Golden rule (same as before):** Before editing any file, re-read the "Aware of" section to know exactly what the previous step left behind in that file. Make changes additive — never replace the whole file.

---

## ROOT CAUSE: Why "Failed to load friends" crashes

This is the #1 thing to understand before writing a single line of code.

In `src/router/v1/index.router.ts`, all three async route handlers (`GET /me`, `GET /friends`, `PATCH /me`) are written like this:

```javascript
router.get("/friends", authenticate, async (req, res) => {
  const listed = await friendService.listFriends(...)  // ← can throw
  return res.json(...)
})
```

**There is no try/catch and no `next(err)` call.** In Express 4, if an `async` handler throws or rejects, Express does NOT automatically forward it to your `genericErrorHandler` middleware. The thrown error becomes an unhandled Promise rejection. The HTTP response is never sent. The browser times out, and `FriendsList.tsx` catches the fetch failure as `"Failed to load friends"`.

This bug also affects `GET /me` and `PATCH /me` but those are less likely to throw in practice.

The fix is simple: wrap the body of every async route handler in try/catch and call `next(err)` on catch.

---

## PHASE A — Backend Fixes (Do these first, no frontend files touched)

---

### STEP A-1 — Fix async error handling in all REST route handlers

- **Resolves:** The "Failed to load friends" error completely. Also protects `/me` and `/PATCH /me`.
- **Files touched:** `src/router/v1/index.router.ts` only
- **Depends on:** Nothing. This is the very first change.
- **Aware of:** This file was last touched in the previous plan's STEP 14 (profile edit endpoint). It already has `/auth`, `/me` (GET), `/friends` (GET), `/me` (PATCH) routes. Do NOT remove any of these. You are only wrapping the async bodies in try/catch.
- **What to do:** For each `async (req, res)` handler, wrap the entire body in:
  ```javascript
  try {
    // existing code
  } catch (err) {
    next(err)
  }
  ```
  Update the function signature from `async (req: AuthRequest, res)` to `async (req: AuthRequest, res, next)`.
  The `genericErrorHandler` in `src/middleware/error.middleware.ts` is already set up to handle `AppError` instances and generic errors — you just need `next(err)` to reach it.

---

### STEP A-2 — Add public user profile endpoint

- **Resolves:** Provides the data needed for the "View other user's profile" page.
- **Files touched:** `src/router/v1/index.router.ts` only
- **Depends on:** STEP A-1 must be complete. You are adding one more route to the same file, and it needs the same try/catch pattern from A-1.
- **Aware of:** A-1 just added try/catch to existing handlers. When adding the new route, follow the same try/catch pattern. Add it BELOW the existing routes so ordering is clean. Do NOT remove or modify any handler from A-1.
- **What to do:** Add `GET /api/v1/users/:userId` with the `authenticate` middleware. It should:
  - Validate that `:userId` is a valid 24-char hex ObjectId (use a simple regex check, throw 400 otherwise)
  - Call `User.findById(userId).select('_id username bio displayPicture createdAt').lean()`
  - Return 404 if not found
  - Return `{ success: true, data: { userId, username, bio, displayPicture, createdAt, joinedAt: createdAt } }`
  - Do NOT expose email, passwordHash, or any private fields
  - Wrap in try/catch with `next(err)` following the A-1 pattern

---

## PHASE B — New Frontend Files (All new files, nothing existing is modified yet)

These steps only CREATE new files. Existing files are untouched until Phase C.

---

### STEP B-1 — Create the Logo component

- **Resolves:** Logo presence across the app (header, sidebar, auth screens)
- **Files touched:** Creates `my-project/src/components/Logo.tsx` (new only)
- **Depends on:** Nothing.
- **Aware of:** No existing file is being modified.
- **What to do:** Create a `Logo` component that accepts a `size` prop (`"sm" | "md" | "lg"`, defaulting to `"md"`). It renders the app name "Connecta" as styled text using a monospace or distinctive font class. Add a small icon beside it — a simple two-overlapping-circles SVG (representing two anonymous people connecting) drawn inline in JSX. Keep it self-contained with no external image dependencies.
  ```
  sm: text-sm — for header bar
  md: text-base — for sidebar
  lg: text-xl — for auth modals and error boundary
  ```
  The icon should be the two-circles in violet/emerald colors matching the existing palette. Export as default.

---

### STEP B-2 — Create the own Profile page

- **Resolves:** Dedicated `/chat/profile` route for viewing and editing your own profile
- **Files touched:** Creates `my-project/src/components/ProfilePage.tsx` (new only)
- **Depends on:** Nothing (uses existing `useAuth` hook and existing `ProfileEditModal` component).
- **Aware of:** `ProfileEditModal.tsx` already exists and works — do NOT recreate it. `ProfilePage.tsx` just renders it conditionally when the Edit button is clicked. `RightSidebar.tsx` also exists and shows the profile in desktop view — `ProfilePage.tsx` is the mobile/full-page equivalent and can share the same design language.
- **What to do:** Create `ProfilePage.tsx` as a full-height scrollable page component. It should:
  - Read `user` from `useAuth()`
  - Show avatar (circle with initial letter or `displayPicture` image), username in large text, email in small muted text, bio, a "Member since" line using `user.createdAt`
  - Have a prominent "Edit Profile" button that sets `showEdit(true)` and renders `<ProfileEditModal open={showEdit} onClose={() => setShowEdit(false)} />`
  - Match the wireframe: back arrow at top left (using `useNavigate(-1)`), avatar center-top, then the info cards below
  - Style consistently with the existing dark theme: `bg-slate-950`, violet accents, rounded cards
  - This page is the "You" tab destination on mobile

---

### STEP B-3 — Create the other user Profile page

- **Resolves:** Ability to tap a friend and see their public profile (matches wireframe "Name, Him/her, Add friend, joined at: date")
- **Files touched:** Creates `my-project/src/components/UserProfilePage.tsx` (new only)
- **Depends on:** STEP A-2 must be complete (the `GET /api/v1/users/:userId` endpoint exists). STEP B-1 should be complete for Logo if you want it in the header.
- **Aware of:** This is a brand new file. It does NOT replace or modify `RightSidebar.tsx`. The right sidebar on desktop still shows profiles. This is the dedicated mobile/full-page profile view.
- **What to do:** Create `UserProfilePage.tsx` that:
  - Reads `:userId` from `useParams()`
  - On mount, fetches `GET /api/v1/users/:userId` using the JWT from `useAuth()`
  - Handles 401 with a silent refresh attempt (call `refreshProfile()` then retry once)
  - Handles 404 with a "User not found" message
  - Shows: back arrow (`useNavigate(-1)`), avatar circle with initial or displayPicture, username as large heading, bio (if any), "Joined: [formatted date]"
  - An "Open Chat" button that calls `navigate('/chat/private?friendUserId=' + userId)` — this already works because `PrivateChat.tsx` handles `friendUserId` search param
  - Loading skeleton state while fetching
  - Note: Do NOT show "Add friend" from this page for now — friend requests flow through anonymous chat only. The button should just be "Open Chat" if they are already friends. For MVP, always show "Open Chat" and let `PrivateChat.tsx` handle the error if they're not friends.

---

### STEP B-4 — Create a shared apiFetch utility

- **Resolves:** Prevents "Failed to load friends" from recurring even after A-1 fix (adds token refresh on 401 for all REST calls)
- **Files touched:** Creates `my-project/src/utils/apiFetch.ts` (new only)
- **Depends on:** Nothing. Pure utility.
- **Aware of:** Nothing has been modified yet in the frontend.
- **What to do:** Create a thin wrapper around `fetch` that:
  - Accepts `(url: string, options: RequestInit, token: string, refreshProfile: () => Promise<void>): Promise<Response>`
  - Makes the initial request with `Authorization: Bearer ${token}`
  - If response is 401, calls `refreshProfile()` and retries once with the new token from localStorage
  - On second 401, throws so the caller can handle it
  - Always includes `credentials: 'include'` and the `Authorization` header
  - Export as `apiFetch`

---

## PHASE C — Update Existing Frontend Files

Now that all new files exist, we update existing files one at a time. Each step specifies exactly which previous changes to preserve.

---

### STEP C-1 — Update App.tsx: add new profile routes

- **Resolves:** Makes `/chat/profile` and `/chat/profile/:userId` reachable
- **Files touched:** `my-project/src/App.tsx` only
- **Depends on:** STEP B-2 (`ProfilePage.tsx` exists) and STEP B-3 (`UserProfilePage.tsx` exists) must be complete.
- **Aware of:** `App.tsx` currently has these routes (do NOT remove any of them):
  - `/` → RootRedirect
  - `/chat` (AppLayout wrapper) with:
    - index → ChatNeutralState
    - `random` → AnonymousChat
    - `private` → PrivateChat (protected)
    - `private/:conversationId` → PrivateChat (protected)
    - `friends` → FriendsList (protected)
  - `*` → redirect to `/`
- **What to add:** Inside the `/chat` AppLayout route group, add:
  - `profile` → `<ProtectedPrivateRoute><ProfilePage /></ProtectedPrivateRoute>`
  - `profile/:userId` → `<ProtectedPrivateRoute><UserProfilePage /></ProtectedPrivateRoute>`
  Import both new components at the top of the file. Keep all existing imports.

---

### STEP C-2 — Update FriendsList.tsx: use apiFetch + add View Profile button

- **Resolves:** Remaining frontend side of the friends error, adds profile navigation
- **Files touched:** `my-project/src/components/FriendsList.tsx` only
- **Depends on:** STEP B-4 (`apiFetch` exists), STEP B-3 (`UserProfilePage` route exists via C-1).
- **Aware of:** `FriendsList.tsx` was not modified in the previous plan at all — it has been unchanged from its original version. The current implementation uses raw `fetch`. Preserve all existing state, types, and rendering logic. You are only:
  1. Replacing the raw `fetch(...)` call with `apiFetch(url, options, token, refreshProfile)` (import `refreshProfile` from `useAuth()`)
  2. Adding a "View Profile" button next to each friend's "Open Chat" button that navigates to `/chat/profile/${friend.userId}`
- **What to change:** In the `useEffect`, replace `fetch(...)` with the new `apiFetch` util. Add `const { token, refreshProfile } = useAuth()` (it already imports `useAuth`). Add import `apiFetch` from `../utils/apiFetch`. In the friend card JSX, add a second button `View Profile` that calls `navigate('/chat/profile/' + friend.userId)`.

---

### STEP C-3 — Update AppLayout.tsx: logo, bottom nav redesign, profile navigation

- **Resolves:** Logo in header, bottom nav matching wireframe (Home / Chats / You), "You" tab routing to profile page
- **Files touched:** `my-project/src/components/AppLayout.tsx` only
- **Depends on:** STEP B-1 (Logo component exists), STEP C-1 (profile routes exist in App.tsx).
- **Aware of:** `AppLayout.tsx` has been modified several times. Current state (as of the last plan, STEP 18) includes:
  - Private socket logic (`privateSocketRef`, `refreshPrivateConversations`, `handleDeleteConversation`)
  - `anonymousChat` from `useChatSocket`
  - `showProfileEdit` state and `ProfileEditModal`
  - `showAuthModal` state and `AuthModal`
  - `sidebarOpen` state for mobile drawer
  - Desktop left sidebar (hidden md:block)
  - Mobile sidebar overlay (fixed, z-40)
  - Main content area with header bar (h-14)
  - Bottom nav (3 buttons: Anonymous, Private, Friends)
  - Desktop right sidebar (`RightSidebar`)
  - `useEffect` for `friendReqState.lastAcceptedAt`
  - `useEffect` for `privateChatStarted`
  - `useEffect` for `sidebarOpen` reset on location change
  **DO NOT REMOVE ANY OF THIS.**
- **What to change:**
  1. Import `Logo` from `./Logo`
  2. In the header bar (`h-14` div), replace the plain text title with `<Logo size="sm" />` on the left side, keep the existing auth buttons on the right
  3. Replace the 3-button bottom nav (Anonymous / Private / Friends) with a new 3-button nav matching the wireframe:
     - **Home** icon + label → navigates to `/chat/random` (anonymous, same as before)
     - **Chats** icon + label → navigates to `selectedConversationId ? /chat/private/${selectedConversationId} : /chat/private` (same logic as current "Private" button)
     - **You** icon + label → navigates to `/chat/profile` (NEW — own profile page)
  4. The active state logic: Home is active on `/chat/random`, Chats is active on any `/chat/private*`, You is active on `/chat/profile*`
  5. Add `selectedProfile` boolean: `location.pathname.startsWith('/chat/profile')`
  6. The `ProfileEditModal` stays — it is still used by the desktop RightSidebar's Edit Profile button. Do not remove it.

---

### STEP C-4 — Update LeftSidebar.tsx: add logo, avatar circles, visual polish

- **Resolves:** Logo in sidebar, avatar circles next to conversation items (matching wireframe), improved visual design
- **Files touched:** `my-project/src/components/LeftSidebar.tsx` only
- **Depends on:** STEP B-1 (Logo exists), STEP C-3 (AppLayout is in final state so sidebar relationship is clear).
- **Aware of:** `LeftSidebar.tsx` has not been changed since the previous plan. Its current state has:
  - `UnreadBadge` component
  - Anonymous section with single button
  - Friends button
  - Private conversations list with hover-delete button
  - Delete confirmation overlay (`pendingDelete` state)
  - `onClose` button for mobile
  **DO NOT REMOVE ANY OF THIS.**
- **What to change:**
  1. Import `Logo` from `./Logo`
  2. In the `h-14` header div, replace the plain `<h2>Chats</h2>` text with `<Logo size="md" />`. Keep the `onClose` button for mobile.
  3. In each private conversation item, add a small avatar circle before the name text. The circle shows the first letter of `chat.name` in a styled div (`w-8 h-8 rounded-full bg-slate-800 text-xs flex items-center justify-center text-violet-300 shrink-0`).
  4. Do the same for the Anonymous button — add a pulsing green dot or avatar circle with `?` character.
  5. For the Friends button, add a small people icon (SVG inline) before the text.
  6. The overall section structure (Anonymous / Private headings / Friends button / conversation list) stays the same. Only visual additions.

---

### STEP C-5 — Update ErrorBoundary.tsx: use Logo component

- **Resolves:** Consistent branding on error screen
- **Files touched:** `my-project/src/components/ErrorBoundary.tsx` only
- **Depends on:** STEP B-1 (Logo exists).
- **Aware of:** `ErrorBoundary.tsx` currently renders `<div className="text-2xl font-bold tracking-tight text-violet-300">Connecta</div>` as plain text. Just replace this with `<Logo size="lg" />`. No other changes.

---

### STEP C-6 — Update AuthModal.tsx: use Logo component

- **Resolves:** Consistent branding on login/signup modal
- **Files touched:** `my-project/src/components/AuthModal.tsx` only
- **Depends on:** STEP B-1 (Logo exists).
- **Aware of:** `AuthModal.tsx` has a `<h3>` heading for "Login" / "Create account". Add `<Logo size="sm" />` ABOVE the `<h3>` heading. Do not remove anything else.

---

## PHASE D — Design Polish (Final pass, touch files that are now stable)

---

### STEP D-1 — Design pass on ProfilePage.tsx

- **Resolves:** Makes own profile page look polished per the wireframe (back arrow, avatar center, info cards)
- **Files touched:** `my-project/src/components/ProfilePage.tsx` (created in B-2, no one has touched it since)
- **Depends on:** B-2 (file exists), C-1 (route is wired).
- **Aware of:** ProfilePage was just created as a basic component. Now finalize the layout to closely match the wireframe: back arrow top-left, avatar centered below header, username large, bio in a card, "Member since" in a card, Edit Profile button prominent and full-width.
- **Design direction:** Match the existing app's dark aesthetic. Use `bg-slate-950` with `border-slate-800` cards. Avatar ring: `ring-2 ring-violet-500/50`. Edit button: full-width violet outlined button like the one in `ProfileEditModal`.

---

### STEP D-2 — Design pass on UserProfilePage.tsx

- **Resolves:** Makes the other user's profile page look right per the wireframe
- **Files touched:** `my-project/src/components/UserProfilePage.tsx` (created in B-3)
- **Depends on:** B-3 (file exists), A-2 (backend endpoint exists), C-1 (route wired).
- **Aware of:** UserProfilePage was created in B-3 as a functional component. Finalize visual design: same back arrow, avatar centered, username + bio, joined date, and the "Open Chat" button styled as a full-width violet button (matching wireframe's "Add friend" button slot).
- **Add:** A loading skeleton (3 placeholder rects using `animate-pulse bg-slate-800 rounded`) while the API call is in flight.

---

## QUICK REFERENCE — All files touched in this plan

| File | Steps that modify it | Notes |
|------|---------------------|-------|
| `src/router/v1/index.router.ts` | A-1, A-2 | Add try/catch + new /users/:userId endpoint |
| `Logo.tsx` | B-1 (create) | New file |
| `ProfilePage.tsx` | B-2 (create), D-1 (polish) | New file |
| `UserProfilePage.tsx` | B-3 (create), D-2 (polish) | New file |
| `utils/apiFetch.ts` | B-4 (create) | New file |
| `App.tsx` | C-1 | Add 2 new routes |
| `FriendsList.tsx` | C-2 | Use apiFetch, add View Profile button |
| `AppLayout.tsx` | C-3 | Logo + bottom nav redesign |
| `LeftSidebar.tsx` | C-4 | Logo + avatar circles |
| `ErrorBoundary.tsx` | C-5 | Use Logo |
| `AuthModal.tsx` | C-6 | Use Logo |

---

## CROSS-CHECK: What this plan does NOT touch

These files from the previous plan are complete and stable. Do NOT edit them:

- `PrivateChat.tsx` — all bug fixes from the previous plan are in place
- `AnonymousChat.tsx` — complete
- `useChatSocket.ts` — complete
- `AuthContext.tsx` — complete (silentRefresh is wired)
- `ProfileEditModal.tsx` — complete, used as-is by ProfilePage
- `RightSidebar.tsx` — still used on desktop, untouched
- All backend socket files (`chat.socket.ts`, `private.socket.ts`) — complete
- `auth.routes.ts`, `auth.service.ts`, `jwt.ts` — complete

---

## HOW THE WIREFRAME MAPS TO THE IMPLEMENTATION

| Wireframe screen | Implementation |
|-----------------|---------------|
| Home/chat list (left) | `LeftSidebar` — now has Logo + avatar circles |
| Anonymous chat (center top) | `AnonymousChat.tsx` — unchanged, already implemented |
| Other user profile (right) | `UserProfilePage.tsx` — NEW (STEP B-3) |
| Own profile (bottom center) | `ProfilePage.tsx` — NEW (STEP B-2) |
| Bottom nav: Home / Chat / You | Updated in `AppLayout.tsx` (STEP C-3) |
| Back arrows on profile screens | `useNavigate(-1)` in both profile pages |
| "Add friend / joined at" card | `UserProfilePage.tsx` — shows "Open Chat" + joined date |
| Edit Profile button | On `ProfilePage.tsx` — opens existing `ProfileEditModal` |

---

## IMPLEMENTATION ORDER SUMMARY (do in this exact order)

```
A-1 → A-2 → B-1 → B-2 → B-3 → B-4 → C-1 → C-2 → C-3 → C-4 → C-5 → C-6 → D-1 → D-2
```

- A-1 and A-2 are pure backend, do them together in one session
- B-1 through B-4 are all new files, no conflicts possible
- C-1 through C-6 each modify one existing file, in dependency order
- D-1 and D-2 are polish passes on files created in B phase
