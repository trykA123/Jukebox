# Jukebox — Self-Hosted Collaborative Music Player

## Overview

A self-hosted web app where users create rooms, share invite links, and listen to YouTube/YT Music tracks together via a synced queue with DJ-style crossfade. No accounts, no databases — just pick a name and vibe.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | **Bun** (fallback: Node 22+) | Fast, native WebSocket support |
| Server | **Hono** | Lightweight, works with both Bun and Node |
| Client | **Vanilla HTML/CSS/JS** (single file) | Zero build step, instant load, easy to serve |
| Real-time | **WebSockets** (native Bun, or `ws` package for Node) | Low latency sync |
| Player | **YouTube IFrame API** (2 instances for crossfade) | No extraction needed, handles DRM/ads |
| Storage | **In-memory** | Rooms are ephemeral, die when empty |
| Styling | Custom CSS — dark theme, warm accent, no glassmorphism | Modern, bold, readable |

## Core Features

1. **Room System** — Create rooms, share invite links (`/room/:id`), auto-delete when empty
2. **Shared Queue** — Paste YouTube/YT Music URLs, oEmbed metadata, add/remove tracks
3. **Synced Playback** — Server-authoritative timestamp sync, late-join support, 2.5s drift correction
4. **Democratic Controls** — Anyone can play/pause, vote-to-skip (majority needed)
5. **DJ Crossfade** — Dual YouTube player instances, configurable 0–8s volume crossfade between tracks
6. **Chat** — Real-time text chat in sidebar, system messages for join/leave
7. **User Presence** — Colored avatars, host badge, live user count, auto host migration

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rooms` | Create room. Body: `{ name?: string }` → `{ id, name }` |
| GET | `/api/rooms/:id` | Room info → `{ id, name, userCount }` or 404 |
| GET | `/api/youtube/resolve?url=...` | Parse URL → `{ youtubeId, title, thumbnail }` |
| WS | `/ws` | WebSocket for all real-time communication |

## Supported YouTube URL Formats

- `youtube.com/watch?v=VIDEO_ID`
- `youtu.be/VIDEO_ID`
- `youtube.com/embed/VIDEO_ID`
- `music.youtube.com/watch?v=VIDEO_ID`
- `youtube.com/shorts/VIDEO_ID`
- Raw 11-char video ID

## Design Direction

- **Theme**: Dark (`#0D0D0D` bg), warm orange accent (`#FF5722`)
- **Typography**: DM Sans + Space Mono (Google Fonts)
- **Feel**: Clean, utilitarian, slightly brutalist. No glass, no blur, no gradients-on-white
- **Layout**: Header → [Main area (now playing + queue) | Sidebar (chat + users)]
- **Mobile**: Sidebar hidden by default, toggled via button

## Detailed Documentation

- `.github/copilot-instructions.md` — Always-on constraints
- `.github/instructions/server.instructions.md` — Server patterns (auto-applied to server/ files)
- `.github/instructions/client.instructions.md` — Client patterns (auto-applied to client/ files)
- `.github/skills/jukebox-dev/` — On-demand dev skill with ARCHITECTURE.md and IMPLEMENTATION.md
- `AGENTS.md` — Cross-tool agent overview
