import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RoomManager } from "./rooms.js";
import { extractYouTubeId, fetchVideoMeta } from "./youtube.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "../../client/dist");

const rooms = new RoomManager();
const app = new Hono();

app.post("/api/rooms", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const created = rooms.createRoom(body?.name);
  return c.json(created, 201);
});

app.get("/api/rooms/:id", (c) => {
  const room = rooms.getRoom(c.req.param("id"));
  if (!room) {
    return c.json({ message: "Room not found" }, 404);
  }

  return c.json({
    id: room.id,
    name: room.name,
    userCount: room.users.size,
  });
});

app.get("/api/youtube/resolve", async (c) => {
  const url = c.req.query("url") || "";
  const youtubeId = extractYouTubeId(url);
  if (!youtubeId) {
    return c.json({ message: "Invalid YouTube URL" }, 400);
  }

  const meta = await fetchVideoMeta(youtubeId);
  return c.json({ youtubeId, title: meta.title, thumbnail: meta.thumbnail });
});

app.get("*", async (c) => {
  const requestPath = c.req.path === "/" ? "/index.html" : c.req.path;
  const safePath = path.normalize(requestPath).replace(/^\/+/, "");
  const fullPath = path.join(clientDir, safePath);

  if (!fullPath.startsWith(clientDir)) {
    return c.text("Not Found", 404);
  }

  try {
    const content = await readFile(fullPath);
    if (safePath.endsWith(".html")) {
      return new Response(content, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response(content);
  } catch {
    try {
      const html = await readFile(path.join(clientDir, "index.html"));
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return c.text("Not Found", 404);
    }
  }
});

const port = Number(process.env.PORT || 15230);

const server = Bun.serve({
  port,
  fetch(req, bunServer) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = bunServer.upgrade(req);
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: {
    async message(ws, message) {
      const raw =
        typeof message === "string"
          ? message
          : Buffer.from(message).toString("utf8");
      let payload;

      try {
        payload = JSON.parse(raw);
      } catch {
        ws.send(
          JSON.stringify({
            type: "room:error",
            message: "Invalid message payload",
          }),
        );
        return;
      }

      const senderId = rooms.wsToUser.get(ws);

      if (payload.type === "join") {
        const result = rooms.joinRoom(payload.roomId, payload.userName, ws);
        if (result?.error) {
          ws.send(
            JSON.stringify({ type: "room:error", message: result.error }),
          );
        }
        return;
      }

      if (!senderId) {
        ws.send(
          JSON.stringify({
            type: "room:error",
            message: "Not joined to a room",
          }),
        );
        return;
      }

      switch (payload.type) {
        case "queue:add": {
          const youtubeId = extractYouTubeId(payload.url || "");
          if (!youtubeId) {
            rooms.sendTo(senderId, {
              type: "room:error",
              message: "Invalid YouTube URL",
            });
            return;
          }
          const meta = await fetchVideoMeta(youtubeId);
          await rooms.addTrack(senderId, {
            youtubeId,
            title: meta.title,
            thumbnail: meta.thumbnail,
            duration: 0,
          });
          return;
        }
        case "queue:remove":
          rooms.removeTrack(senderId, payload.trackId);
          return;
        case "queue:vote":
          rooms.voteTrack(senderId, payload.trackId);
          return;
        case "playback:play":
          rooms.play(senderId);
          return;
        case "playback:pause":
          rooms.pause(senderId);
          return;
        case "playback:skip":
          rooms.skip(senderId);
          return;
        case "playback:seek":
          rooms.seek(senderId, payload.time);
          return;
        case "chat:message":
          rooms.chat(senderId, payload.text);
          return;
        case "crossfade:set":
          rooms.setCrossfade(senderId, payload.duration);
          return;
        default:
          rooms.sendTo(senderId, {
            type: "room:error",
            message: "Unknown message type",
          });
      }
    },
    close(ws) {
      rooms.leaveByWs(ws);
    },
  },
});

console.log(`Jukebox server listening on http://localhost:${server.port}`);
