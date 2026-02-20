---
applyTo: "server/**"
---

# Server Development Instructions

## Framework
- Hono for HTTP routes, Bun native WebSocket (or `ws` package for Node)
- Entry point: `server/src/index.js`
- All files are ESM (`import`/`export`, no `require`)

## HTTP Routes
- `POST /api/rooms` — create room, body `{ name?: string }`, returns `{ id, name }`
- `GET /api/rooms/:id` — room info, returns `{ id, name, userCount }` or 404
- `GET /api/youtube/resolve?url=...` — parse YouTube URL, return `{ youtubeId, title, thumbnail }`
- `/*` — serve static files from `../client/dist/`

## WebSocket (`/ws`)
- On connect: client sends `{ type: "join", roomId, userName }`
- Message handler: parse JSON, switch on `msg.type`, call RoomManager methods
- On close: call `rooms.leaveByWs(ws)` to clean up

## RoomManager (`rooms.js`)
- All room/queue/playback state lives in this class
- Two connection maps: `connections` (userId → {ws, roomId}) and `wsToUser` (ws → userId)
- Key methods: `createRoom`, `joinRoom`, `leaveRoom`, `addTrack`, `removeTrack`, `play`, `pause`, `skip`, `seek`, `nextTrack`, `chat`, `setCrossfade`
- `broadcastToRoom()` sends to all users in a room, optionally excluding one
- `serializeRoom()` converts Maps/Sets to arrays/counts for JSON serialization

## YouTube (`youtube.js`)
- `extractYouTubeId(url)` — supports youtube.com, youtu.be, music.youtube.com, shorts, embed, raw 11-char ID
- `fetchVideoMeta(youtubeId)` — calls YouTube oEmbed (no API key), returns `{ title, thumbnail }`, graceful fallback on failure

## Playback Sync (server-authoritative)
- Room stores `startedAt` (ms timestamp) and `elapsed` (seconds when paused)
- On play: `startedAt = Date.now() - elapsed * 1000`
- On pause: `elapsed = (Date.now() - startedAt) / 1000`
- Clients compute seek position from these values

## Skip Logic
- `skipVotes` is a `Set<userId>` on the room
- Threshold: `ceil(userCount / 2)`
- When met, call `nextTrack()` which clears votes and advances

## Error Handling
- Invalid YouTube URL → send `{ type: "room:error", message: "Invalid YouTube URL" }`
- Room not found → send `{ type: "room:error", message: "Room not found" }`
- WS send failure → catch, call `leaveRoom(userId)`
- oEmbed failure → fallback title "Unknown Track", thumbnail from img.youtube.com
