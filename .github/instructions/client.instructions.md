---
applyTo: "client/**"
---

# Client Development Instructions

## Architecture
- Single `index.html` file with all CSS in `<style>` and all JS in `<script>` — no separate files
- No build step, no framework, no module bundler
- Served statically by the Hono server

## Screens
- **Home**: name input, room name input, "Create Room" button, divider, invite code input, "Join Room" button
- **Room**: header (eq-bars, room name, user count, invite btn, sidebar toggle) → body (main area + sidebar)

## YouTube IFrame API
- Load via `<script src="https://www.youtube.com/iframe_api">`
- Create **two** player instances (`yt-player-a` and `yt-player-b`) for crossfade
- Hide with: `position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none;`
- Do NOT use `display: none` — it breaks the IFrame API
- `loadVideoById()` auto-plays — if desired state is paused, call `pauseVideo()` shortly after
- `setVolume(0–100)` is integer only — round lerp values
- `onStateChange` with state `0` (ENDED) → notify server to advance track

## Crossfade Engine
- Two players swap active/on-deck roles
- Poll `getCurrentTime()` every 250ms
- When `currentTime >= duration - crossfadeDuration`: load next track on on-deck player at volume 0, start 50ms interval lerping volumes
- Volume lerp: `outgoing = Math.round(100 * (1 - progress))`, `incoming = Math.round(100 * progress)`
- On complete: stop outgoing, swap roles, notify server
- If `crossfadeDuration === 0`: hard-cut, no overlap
- Use `setInterval` not `requestAnimationFrame` (works in background tabs)
- Clear interval on skip/pause/track-change to avoid ghost fades
- Clamp crossfade duration to remaining track time if it exceeds it

## WebSocket
- Connect to `ws(s)://{host}/ws` on room join
- Send `{ type: "join", roomId, userName }` immediately on open
- Handle all server message types (room:state, queue:updated, playback:sync, user:joined, user:left, skip:votes, chat:message, crossfade:updated, room:error)
- Auto-reconnect on close with 3s delay

## Playback Sync
- On `playback:sync`: compare `ytPlayer.getCurrentTime()` to expected position
- If drift > 2.5s → `seekTo(expected)`
- Progress bar: update every 500ms from `getCurrentTime()` / `getDuration()`

## URL Routing
- Check `location.pathname` for `/room/:id` on page load → pre-fill invite code
- Use `history.pushState()` on room create/join

## CSS Design Tokens
- `--bg: #0D0D0D`, `--surface: #161616`, `--surface-2: #1E1E1E`, `--surface-3: #262626`
- `--border: #2A2A2A`, `--text: #E8E4E0`, `--text-dim: #8A8580`
- `--accent: #FF5722`, `--accent-hover: #FF7043`, `--accent-dim: #FF57221A`
- `--green: #4CAF50`, `--radius: 10px`
- `--font: 'DM Sans', sans-serif`, `--mono: 'Space Mono', monospace`

## Animations
- `fadeIn`: opacity 0→1, translateY 8→0
- `slideUp`: opacity 0→1, translateY 20→0
- Equalizer bars in header: 3 bars with staggered `animation-delay`, paused class toggles `animation-play-state`
- Toast: fixed bottom center, translateY in/out

## Layout
- Sidebar: 320px fixed width, border-left
- Mobile (<768px): sidebar hidden, toggleable as full-screen overlay
- Custom scrollbar: 6px thumb, transparent track
