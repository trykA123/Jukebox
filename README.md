# Jukebox

Self-hosted collaborative YouTube room player with synced queue, live chat, skip votes, and DJ-style crossfade.

## Requirements

- Bun 1.1+ (preferred runtime)

## Quick Start

```bash
bun run setup
bun run dev
```

Open http://localhost:15230

## Production Start

```bash
bun run start
```

## Scripts

- `bun run setup` — install server dependencies
- `bun run dev` — start server in watch mode
- `bun run start` — start server normally

## Configuration

- `PORT` (optional): HTTP port for the server (default: `15230`)

Example:

```bash
PORT=4000 bun run start
```

## Docker Compose

Build and run with Docker Compose:

```bash
docker-compose up --build -d
```

Open http://localhost:15230

Stop:

```bash
docker-compose down
```
