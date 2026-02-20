# Jukebox — Implementation Guide

Step-by-step build order for AI coding agents. Read `SPEC.md` (repo root) for features and `ARCHITECTURE.md` (in this same references folder) for data models and protocol details.

## Prerequisites

- Bun (preferred) or Node.js 22+
- No external API keys needed (YouTube oEmbed is free and keyless)

## Build Order

### Phase 1: Server Skeleton

1. **Initialize project** — Create `server/package.json` with ESM (`"type": "module"`). Dependencies: `hono`, `nanoid`, `ws` (only if using Node; Bun has native WS).

2. **`server/src/youtube.js`** — Two exports:
   - `extractYouTubeId(url)` → returns 11-char ID or null. Support all URL patterns listed in SPEC.md.
   - `fetchVideoMeta(youtubeId)` → calls YouTube oEmbed, returns `{ title, thumbnail }`. Graceful fallback on failure.

3. **`server/src/rooms.js`** — `RoomManager` class. This is the core of the app. Implement all methods described in ARCHITECTURE.md:
   - `createRoom(name)`, `getRoom(id)`, `joinRoom(roomId, userName, ws)`, `leaveRoom(userId)`, `leaveByWs(ws)`
   - `addTrack(userId, trackData)`, `removeTrack(userId, trackId)`
   - `play(userId)`, `pause(userId)`, `skip(userId)`, `seek(userId, time)`
   - `nextTrack(roomId)`, `chat(userId, text)`
   - `setCrossfade(userId, duration)` — validate 0–8, update room, broadcast
   - Internal: `broadcastToRoom()`, `sendTo()`, `broadcastPlaybackSync()`, `serializeRoom()`
   - Two maps for connection tracking: `connections` (userId → {ws, roomId}) and `wsToUser` (ws → userId)

4. **`server/src/index.js`** — Entry point:
   - HTTP routes with Hono: `POST /api/rooms`, `GET /api/rooms/:id`, `GET /api/youtube/resolve`
   - WebSocket upgrade on `/ws` path
   - WS message handler: parse JSON, switch on `msg.type`, call RoomManager methods
   - Serve static files from `../client/dist/`
   - For Bun: use `Bun.serve()` with fetch + websocket config
   - For Node: use `express` + `ws` library with HTTP server upgrade

### Phase 2: Client (Single HTML File)

5. **`client/dist/index.html`** — Everything inlined (CSS in `<style>`, JS in `<script>`).

   **Screens:**
   - **Home screen**: Name input, room name input, "Create Room" button. Divider. Invite link/code input, "Join Room" button.
   - **Room screen**: Header (eq-bars indicator, room name, user count, invite button, sidebar toggle) → Body (main area + sidebar).

   **Main area components:**
   - Now Playing: thumbnail, title, added-by, play/pause button, skip button with vote counter, crossfade slider, progress bar
   - Add Track: input field + "Add" button
   - Queue: list of tracks with index, thumbnail, title, added-by, remove button (visible on hover)
   - Empty state when queue is empty

   **Sidebar:**
   - Two tabs: Chat and People
   - Chat: message list + input
   - People: user list with colored avatars and host badge

   **Modals:**
   - Invite modal: shows room URL, copy button

   **JS Logic:**
   - YouTube IFrame API: load via script tag, create **two** player instances (`yt-player-a` and `yt-player-b`) in hidden divs for crossfade support. Handle `onStateChange` for track end detection.
   - **Crossfade engine**: poll `getCurrentTime()` every 250ms. When `currentTime >= duration - crossfadeDuration`, begin the fade — load next track on the on-deck player, run a 50ms interval that lerps volumes over the crossfade duration. On complete, swap active/on-deck roles. See ARCHITECTURE.md for full flow and edge cases.
   - WebSocket: connect on room join, handle all server message types, auto-reconnect on close
   - Sync: on `playback:sync`, compare current position to expected, seek if drift >2.5s
   - Progress bar: update every 500ms from `ytPlayer.getCurrentTime()` and `ytPlayer.getDuration()`
   - URL routing: check `location.pathname` for `/room/:id` pattern on page load, pre-fill invite code

   **CSS Design:** (see SPEC.md for full design direction)
   - Dark theme, `#0D0D0D` bg, `#FF5722` accent
   - Fonts: DM Sans + Space Mono (Google Fonts)
   - Animations: `fadeIn`, `slideUp` for elements; equalizer bars (`eq1`/`eq2`/`eq3` keyframes) in header
   - Sidebar: 320px fixed width, hidden on mobile (<768px), toggle-able as full-screen overlay
   - Custom scrollbar styling

### Phase 3: Polish

6. **Root `package.json`** — Scripts:
   - `setup`: install deps in server/
   - `dev`: run server with --watch
   - `start`: run server (production)

7. **`README.md`** — Quick start (install Bun, `cd server && bun install`, `bun run start`, open localhost:3000). Mention PORT env var.

## Testing Checklist

After building, verify these scenarios:

- [ ] Create a room, see it in the URL
- [ ] Open the invite link in a second browser tab with a different name → both users see each other
- [ ] Paste a YouTube URL → track appears in queue, starts playing for both users
- [ ] Second user adds a track → queues after the first
- [ ] Click pause → both users pause
- [ ] Click skip on both tabs (2 users = need 1 vote majority) → track advances
- [ ] Close one tab → user disappears from the other tab's people list
- [ ] Close all tabs → room should be gone (verify by trying the invite link again → 404)
- [ ] Send a chat message → appears on both tabs
- [ ] Click progress bar → both users seek to that position
- [ ] Open `/room/nonexistent` → should show error / redirect to home
- [ ] Paste a `music.youtube.com` link → should work
- [ ] Paste a `youtu.be` short link → should work
- [ ] Paste a raw 11-char video ID → should work
- [ ] Add two tracks, let the first approach its end → crossfade should kick in, volume ramps smoothly
- [ ] Set crossfade slider to 0 → tracks should hard-cut with no overlap
- [ ] Set crossfade to max (8s) on a short track → should clamp to remaining duration
- [ ] Skip during an active crossfade → outgoing stops, incoming snaps to full volume

## Gotchas & Tips

- **YouTube IFrame API auto-plays on `loadVideoById`** — if the desired state is paused, you need to call `pauseVideo()` shortly after load (use a small setTimeout or listen for the PLAYING state change).
- **oEmbed doesn't return duration** — the client can get duration from `ytPlayer.getDuration()` after the video loads. Optionally send it back to the server to display in the queue, but it's not critical.
- **Bun's WebSocket API differs from the `ws` npm package** — if targeting both runtimes, abstract the WS layer or pick one. For Bun: `Bun.serve({ websocket: { open, message, close } })`. For Node: `new WebSocketServer({ noServer: true })` + `server.on('upgrade', ...)`.
- **CORS** — only needed in dev if running client on a different port. In production the server serves the client, so same-origin.
- **The hidden YouTube player** — use `position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none;` to hide it. Setting `display: none` prevents the IFrame API from working. You need **two** of these containers for the crossfade dual-player setup.
- **YouTube `setVolume()` is 0–100** — it's an integer, not a float. Round your lerp values. Also note that `setVolume` only controls the player volume, not system volume, which is exactly what we want.
- **Crossfade timing** — use `setInterval` at ~50ms for smooth fades. Don't rely on `requestAnimationFrame` since the tab might be in the background. Clear the interval on skip/pause/track-change to avoid ghost fades.
