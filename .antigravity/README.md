# Jukebox — Agent Overview

Jukebox is a self-hosted collaborative music player. Users create rooms, share invite links, and listen to YouTube tracks together through a synced queue with crossfade transitions.

## Key Files
- `SPEC.md` (repo root) — Full feature spec, API endpoints, design direction
- `.antigravity/rules/rules.md` — Always-on constraints (tech stack, do-nots)
- `.antigravity/skills/jukebox-dev/` — Detailed architecture + implementation guide

## Architecture Summary
- Server (Hono + WebSocket) manages rooms, queues, and playback state in memory
- Client (single HTML file) connects via WebSocket and uses YouTube IFrame API for playback
- Playback sync is server-authoritative (server stores timestamps, clients self-correct)
- Two hidden YouTube player instances enable DJ-style crossfade between tracks
- Rooms auto-delete when the last user disconnects
