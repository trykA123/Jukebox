# Jukebox — Agent Instructions

Jukebox is a self-hosted collaborative music player. Users create rooms, share invite links, and listen to YouTube tracks together through a synced queue with DJ-style crossfade transitions.

## Project Structure

```
server/src/index.js    — Entry point: Hono HTTP routes + WebSocket upgrade
server/src/rooms.js    — RoomManager class (all room/queue/playback/chat logic)
server/src/youtube.js  — YouTube URL parser + oEmbed metadata fetcher
client/dist/index.html — Single-file SPA (HTML + CSS + JS all inlined)
```

## Architecture Summary

- Server (Hono + WebSocket) manages rooms, queues, and playback state in memory
- Client (single HTML file) connects via WebSocket and uses YouTube IFrame API
- Playback sync is server-authoritative (server stores timestamps, clients self-correct)
- Two hidden YouTube player instances enable DJ-style crossfade between tracks
- Rooms are ephemeral — auto-delete when the last user disconnects
- No database, no auth, no API keys, no build step

## Key Docs

- `SPEC.md` — Full feature spec, API endpoints, design direction
- `.github/copilot-instructions.md` — Tech stack constraints and do-nots
- `.github/instructions/server.instructions.md` — Server-specific patterns and conventions
- `.github/instructions/client.instructions.md` — Client-specific patterns, CSS tokens, crossfade details
- `.github/skills/jukebox-dev/SKILL.md` — On-demand skill with links to:
  - `references/ARCHITECTURE.md` — Data models, full WS protocol, sync strategy, crossfade mechanics
  - `references/IMPLEMENTATION.md` — Build order, testing checklist, gotchas
