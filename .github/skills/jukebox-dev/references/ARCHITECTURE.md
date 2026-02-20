# Jukebox — Architecture

## Data Models (In-Memory)

### Room

```
Room {
  id: string              // nanoid(8)
  name: string            // user-provided or "Room {id}"
  createdAt: number       // Date.now()
  hostId: string          // userId of current host
  queue: Track[]
  currentIndex: number    // -1 = nothing playing
  playbackState: "playing" | "paused"
  startedAt: number       // server timestamp (ms) when current track began playing
  elapsed: number         // seconds into track when paused
  users: Map<string, User>
  skipVotes: Set<string>  // userIds who voted to skip current track
  crossfadeDuration: number  // seconds (0–8, default 3). 0 = hard cut.
}
```

### Track

```
Track {
  id: string              // nanoid(8)
  youtubeId: string       // 11-char YouTube video ID
  title: string           // from oEmbed
  thumbnail: string       // https://img.youtube.com/vi/{id}/mqdefault.jpg
  duration: number        // seconds (0 if unknown, client can update)
  addedBy: string         // userId
  addedByName: string     // display name at time of adding
}
```

### User

```
User {
  id: string              // nanoid(10)
  name: string            // max 24 chars
  color: string           // hex color from predefined palette
}
```

## Connection Tracking

The server maintains two maps for WebSocket management:

- `connections: Map<userId, { ws, roomId }>` — look up a user's socket and room
- `wsToUser: Map<ws, userId>` — reverse lookup for disconnect handling

## WebSocket Protocol

All messages are JSON. The `type` field determines the message kind.

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `join` | `{ roomId, userName }` | Join a room (sent immediately after WS connects) |
| `queue:add` | `{ url }` | Add a YouTube URL to the queue |
| `queue:remove` | `{ trackId }` | Remove a track (own tracks or host privilege) |
| `playback:play` | — | Resume playback |
| `playback:pause` | — | Pause playback |
| `playback:skip` | — | Cast a skip vote |
| `playback:seek` | `{ time }` | Seek to `time` seconds |
| `chat:message` | `{ text }` | Send a chat message (max 500 chars) |
| `crossfade:set` | `{ duration }` | Set crossfade duration in seconds (0–8) |

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `room:state` | `{ room: SerializedRoom, userId }` | Full state on join |
| `room:error` | `{ message }` | Error message (room not found, invalid URL, etc.) |
| `queue:updated` | `{ queue, currentIndex }` | Queue changed (add/remove/reorder/skip) |
| `playback:sync` | `{ state, currentIndex, elapsed, timestamp }` | Playback state changed |
| `user:joined` | `{ user }` | A user joined the room |
| `user:left` | `{ userId }` | A user left the room |
| `skip:votes` | `{ current, needed }` | Skip vote tally updated |
| `chat:message` | `{ userId, userName, text, timestamp }` | Chat message from a user |
| `crossfade:updated` | `{ duration }` | Crossfade duration changed |

### SerializedRoom (sent on join)

```
SerializedRoom {
  id, name, hostId,
  queue: Track[],
  currentIndex: number,
  playbackState: "playing" | "paused",
  elapsed: number,          // computed: current seconds into track
  startedAt: number,
  users: User[],            // array, not Map
  skipVotes: number,        // count, not Set
  skipNeeded: number,       // ceil(userCount / 2)
  crossfadeDuration: number // seconds (0–8)
}
```

## Playback Sync Strategy

### Server-Authoritative Clock

The server is the single source of truth for "what's playing and where."

**When a track starts playing:**
```
room.startedAt = Date.now()   // absolute server timestamp
room.elapsed = 0
room.playbackState = "playing"
```

**When paused:**
```
room.elapsed = (Date.now() - room.startedAt) / 1000
room.playbackState = "paused"
```

**When resumed:**
```
room.startedAt = Date.now() - room.elapsed * 1000
room.playbackState = "playing"
```

**When a client joins mid-track:**
```
Server sends elapsed = (Date.now() - room.startedAt) / 1000
Client loads video and seeks to that position
```

### Client Sync Logic

```
On receiving playback:sync message:
  1. If different video → loadVideoById(youtubeId, startSeconds: elapsed)
  2. If same video:
     a. Calculate expected position from elapsed + time since message
     b. If |currentTime - expected| > 2.5s → seekTo(expected)
     c. If state is "playing" → playVideo()
     d. If state is "paused" → pauseVideo()
```

### DJ Crossfade (Client-Side)

The crossfade is implemented entirely on the client using **two YouTube player instances** (Player A and Player B). The server only stores and syncs the `crossfadeDuration` setting.

**Dual-Player Setup:**
```
#yt-player-a  — currently active player
#yt-player-b  — on-deck player (preloaded with next track)
```

Both are hidden the same way (1×1px, opacity 0). Only one produces audible output at a time (except during crossfade overlap).

**Crossfade Flow:**

```
1. Track is playing on Player A at full volume (100)
2. Client monitors currentTime via a polling interval (~250ms)
3. When currentTime >= duration - crossfadeDuration:
   a. Load next track on Player B, seekTo(0), set volume to 0, playVideo()
   b. Start crossfade interval (~50ms ticks over crossfadeDuration):
      - Player A volume: lerp from 100 → 0
      - Player B volume: lerp from 0 → 100
   c. When crossfade completes:
      - Player A.stopVideo()
      - Swap roles: Player B is now "active", Player A is now "on-deck"
      - Notify server that track advanced (so server updates currentIndex)
4. If crossfadeDuration === 0:
   - Skip the overlap — just hard-cut to the next track (existing behavior)
```

**Volume Lerp (linear interpolation):**
```
progress = elapsedInCrossfade / crossfadeDuration  // 0.0 → 1.0
outgoingVolume = Math.round(100 * (1 - progress))
incomingVolume = Math.round(100 * progress)
```

**Edge Cases:**
- If there's no next track in the queue, no crossfade — just let the track end normally
- If user skips during a crossfade, cancel the fade, stop the outgoing player, snap incoming to full volume
- If crossfade duration is longer than the remaining track, clamp to the remaining duration
- If a new track is added to the queue while crossfade is active, it doesn't affect the in-progress fade

**Server's Role:**
- Stores `crossfadeDuration` on the Room
- Broadcasts `crossfade:updated` when a user changes the setting via `crossfade:set`
- The actual volume manipulation is 100% client-side — server doesn't know about volume

### Track End Handling

When YouTube player fires `onStateChange` with state `ENDED` (0):
- Client sends `playback:skip` to server
- Server's `nextTrack()` advances `currentIndex` and broadcasts
- All clients receive new `queue:updated` + `playback:sync`
- If it was the last track, `playbackState` becomes `"paused"`

## Skip Vote Logic

```
On skip vote:
  1. Add userId to room.skipVotes
  2. needed = ceil(room.users.size / 2)
  3. Broadcast { current: skipVotes.size, needed }
  4. If skipVotes.size >= needed → call nextTrack(roomId)

On nextTrack:
  1. Clear skipVotes
  2. If more tracks → advance currentIndex, set playing
  3. If no more tracks → pause
  4. Broadcast queue:updated + playback:sync
```

## YouTube Metadata Resolution

Uses YouTube oEmbed (no API key required):
```
GET https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={VIDEO_ID}&format=json
```

Returns: `{ title, author_name, thumbnail_url, ... }`

Thumbnail URL pattern: `https://img.youtube.com/vi/{VIDEO_ID}/mqdefault.jpg`

## Room Lifecycle

```
1. POST /api/rooms → creates Room in memory, returns { id, name }
2. Client opens WebSocket to /ws
3. Client sends { type: "join", roomId, userName }
4. Server creates User, adds to Room, sends room:state
5. ... interactions ...
6. On WS close → server removes user from room
7. If room.users.size === 0 → delete room from memory
```

## Host Migration

When the host disconnects:
```
room.hostId = room.users.keys().next().value  // first remaining user
```

No special notification — clients can derive host status from the user list.

## Error Handling

- Invalid YouTube URL → `room:error` with "Invalid YouTube URL"
- Room not found on join → `room:error` with "Room not found"
- oEmbed fetch fails → fallback title "Unknown Track", thumbnail from img.youtube.com
- WS send fails → catch error, call leaveRoom(userId) to clean up

## Security Considerations

- Room IDs are short random strings (nanoid) — not guessable but also not secret. Fine for self-hosted LAN/friends app.
- Chat messages truncated to 500 chars server-side
- User names truncated to 24 chars
- No authentication — by design. Put behind a reverse proxy with auth if needed (nginx + basic auth, Authelia, etc.)

## Performance Notes

- In-memory only — no DB overhead, no I/O
- WebSocket messages are small JSON payloads (<1KB typically)
- YouTube IFrame API handles all media streaming — server never touches audio/video data
- Room cleanup is immediate (no timers — delete on last leave)
