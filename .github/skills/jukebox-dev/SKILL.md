---
name: jukebox-dev
description: Build, modify, or debug the Jukebox collaborative music player. Use when working on the server (Hono + WebSocket), client (vanilla HTML/JS), YouTube integration, real-time playback sync, crossfade engine, queue management, room lifecycle, or chat. Do not use for unrelated projects.
---

# Jukebox Development Skill

Before implementing any changes, read the relevant reference docs:

1. **[ARCHITECTURE.md](references/ARCHITECTURE.md)** — Data models (Room, Track, User), full WebSocket protocol (all client→server and server→client message types), server-authoritative sync strategy, crossfade dual-player mechanics, skip vote logic, room lifecycle, host migration, error handling.

2. **[IMPLEMENTATION.md](references/IMPLEMENTATION.md)** — Step-by-step build order (3 phases), testing checklist (18 items), and gotchas (YT autoplay quirk, hidden player CSS, crossfade timing, volume API).

## Quick Reference

- Playback sync: server stores `startedAt` timestamp, clients compute elapsed time
- Crossfade: two YouTube IFrame players swap active/on-deck roles, volume lerp over configurable duration
- Skip: vote-based, `ceil(userCount / 2)` needed to advance
- Rooms: ephemeral, in-memory, auto-delete when empty
- Client: single `index.html`, all CSS/JS inlined
- No TypeScript, no frameworks, no build step

## When Making Changes

- Always test both the "first track added" and "mid-queue join" scenarios
- If touching WebSocket messages, update both server handler AND client handler
- If modifying playback logic, verify crossfade still works (test with crossfade=0 and crossfade=5)
- Run through the testing checklist in IMPLEMENTATION.md after significant changes
