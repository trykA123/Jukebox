# Jukebox — Project Instructions

## Tech Stack (non-negotiable)
- Runtime: Bun (fallback Node 22+)
- Server: Hono + native WebSockets (Bun) or `ws` package (Node)
- Client: Single-file vanilla HTML/CSS/JS — no framework, no build step
- Player: YouTube IFrame API — two instances for crossfade
- Storage: In-memory only — rooms are ephemeral
- No external API keys — YouTube oEmbed is keyless

## Conventions
- ESM everywhere (`"type": "module"` in package.json)
- Plain JavaScript, no TypeScript. Use JSDoc comments where helpful.
- Server serves the client statically from `../client/dist/`
- All real-time communication over WebSocket at `/ws`

## Design Constraints
- Dark theme: `#0D0D0D` bg, `#FF5722` accent
- Fonts: DM Sans + Space Mono (Google Fonts)
- No glassmorphism, no blur, no gradients-on-white, no Inter/Roboto

## Do NOT
- Add a database or any persistence layer
- Use React, Svelte, Vue, or any frontend framework
- Split the client into multiple files
- Require any API keys or environment secrets
- Add authentication or user accounts
- Use TypeScript
