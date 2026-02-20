import { nanoid } from "nanoid";

const USER_COLORS = [
  "#FF5722",
  "#4CAF50",
  "#03A9F4",
  "#FFC107",
  "#9C27B0",
  "#00BCD4",
  "#E91E63",
  "#8BC34A",
];

function safeText(value, fallback, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return fallback;
  }
  return text.slice(0, maxLength);
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.connections = new Map();
    this.wsToUser = new Map();
  }

  createRoom(name) {
    const id = nanoid(8);
    const roomName = safeText(name, `Room ${id}`, 48);

    const room = {
      id,
      name: roomName,
      createdAt: Date.now(),
      hostId: "",
      queue: [],
      currentIndex: -1,
      playbackState: "paused",
      startedAt: Date.now(),
      elapsed: 0,
      users: new Map(),
      trackVotes: new Map(),
      skipVotes: new Set(),
      crossfadeDuration: 3,
    };

    this.rooms.set(id, room);
    return { id: room.id, name: room.name };
  }

  getRoom(id) {
    return this.rooms.get(id) || null;
  }

  joinRoom(roomId, userName, ws) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { error: "Room not found" };
    }

    const userId = nanoid(10);
    const user = {
      id: userId,
      name: safeText(userName, "Guest", 24),
      color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
    };

    room.users.set(userId, user);
    if (!room.hostId) {
      room.hostId = userId;
    }

    this.connections.set(userId, { ws, roomId: room.id });
    this.wsToUser.set(ws, userId);

    this.sendTo(userId, {
      type: "room:state",
      room: this.serializeRoom(room),
      userId,
    });

    this.broadcastToRoom(
      room.id,
      {
        type: "user:joined",
        user,
      },
      userId,
    );

    this.broadcastToRoom(room.id, {
      type: "skip:votes",
      current: room.skipVotes.size,
      needed: this.getSkipNeeded(room),
    });

    this.chatSystem(room.id, `${user.name} joined the room`);

    return { room, user };
  }

  leaveRoom(userId) {
    const connection = this.connections.get(userId);
    if (!connection) {
      return;
    }

    const { roomId, ws } = connection;
    const room = this.rooms.get(roomId);

    this.connections.delete(userId);
    this.wsToUser.delete(ws);

    if (!room) {
      return;
    }

    const user = room.users.get(userId);
    room.users.delete(userId);
    room.skipVotes.delete(userId);

    if (room.hostId === userId) {
      room.hostId = room.users.keys().next().value || "";
    }

    this.broadcastToRoom(room.id, { type: "user:left", userId });
    this.broadcastToRoom(room.id, {
      type: "skip:votes",
      current: room.skipVotes.size,
      needed: this.getSkipNeeded(room),
    });

    if (user) {
      this.chatSystem(room.id, `${user.name} left the room`);
    }

    if (room.users.size === 0) {
      this.rooms.delete(room.id);
      return;
    }
  }

  leaveByWs(ws) {
    const userId = this.wsToUser.get(ws);
    if (!userId) {
      return;
    }
    this.leaveRoom(userId);
  }

  async addTrack(userId, trackData) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room, user } = located;
    const track = {
      id: nanoid(8),
      youtubeId: trackData.youtubeId,
      title: safeText(trackData.title, "Unknown Track", 200),
      thumbnail: trackData.thumbnail,
      duration: Number(trackData.duration) || 0,
      addedBy: user.id,
      addedByName: user.name,
      addedAt: Date.now(),
    };

    room.queue.push(track);
    room.trackVotes.set(track.id, new Set());

    if (room.currentIndex === -1) {
      room.currentIndex = 0;
      room.playbackState = "playing";
      room.elapsed = 0;
      room.startedAt = Date.now();
      room.skipVotes.clear();
    }

    this.broadcastQueueUpdated(room.id);

    this.broadcastPlaybackSync(room.id);
    this.broadcastToRoom(room.id, {
      type: "skip:votes",
      current: room.skipVotes.size,
      needed: this.getSkipNeeded(room),
    });
  }

  removeTrack(userId, trackId) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room, user } = located;
    const index = room.queue.findIndex((track) => track.id === trackId);
    if (index === -1) {
      return;
    }

    const track = room.queue[index];
    const canRemove = track.addedBy === user.id || room.hostId === user.id;
    if (!canRemove) {
      this.sendTo(user.id, {
        type: "room:error",
        message: "Not allowed to remove this track",
      });
      return;
    }

    room.queue.splice(index, 1);
    room.trackVotes.delete(track.id);

    if (room.queue.length === 0) {
      room.currentIndex = -1;
      room.playbackState = "paused";
      room.elapsed = 0;
      room.startedAt = Date.now();
      room.skipVotes.clear();
    } else if (index < room.currentIndex) {
      room.currentIndex -= 1;
    } else if (index === room.currentIndex) {
      if (room.currentIndex >= room.queue.length) {
        room.currentIndex = room.queue.length - 1;
      }
      room.elapsed = 0;
      room.startedAt = Date.now();
      room.playbackState = "playing";
      room.skipVotes.clear();
    }

    this.broadcastQueueUpdated(room.id);

    this.broadcastPlaybackSync(room.id);
    this.broadcastToRoom(room.id, {
      type: "skip:votes",
      current: room.skipVotes.size,
      needed: this.getSkipNeeded(room),
    });
  }

  play(userId) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room } = located;
    if (room.currentIndex < 0 || room.currentIndex >= room.queue.length) {
      return;
    }

    room.startedAt = Date.now() - room.elapsed * 1000;
    room.playbackState = "playing";
    this.broadcastPlaybackSync(room.id);
  }

  pause(userId) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room } = located;
    if (room.playbackState === "playing") {
      room.elapsed = Math.max(0, (Date.now() - room.startedAt) / 1000);
    }
    room.playbackState = "paused";
    this.broadcastPlaybackSync(room.id);
  }

  skip(userId) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room, user } = located;
    if (room.queue.length === 0) {
      return;
    }

    room.skipVotes.add(user.id);
    const needed = this.getSkipNeeded(room);

    this.broadcastToRoom(room.id, {
      type: "skip:votes",
      current: room.skipVotes.size,
      needed,
    });

    if (room.skipVotes.size >= needed) {
      this.nextTrack(room.id);
    }
  }

  seek(userId, time) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room } = located;
    const safeTime = Math.max(0, Number(time) || 0);
    room.elapsed = safeTime;
    if (room.playbackState === "playing") {
      room.startedAt = Date.now() - safeTime * 1000;
    }
    this.broadcastPlaybackSync(room.id);
  }

  voteTrack(userId, trackId) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room, user } = located;
    const index = room.queue.findIndex((track) => track.id === trackId);
    if (index === -1) {
      return;
    }

    const track = room.queue[index];

    if (index <= room.currentIndex) {
      this.sendTo(user.id, {
        type: "room:error",
        message: "Can only vote upcoming tracks",
      });
      return;
    }

    if (track.addedBy === user.id) {
      this.sendTo(user.id, {
        type: "room:error",
        message: "You cannot vote for your own track",
      });
      return;
    }

    let votes = room.trackVotes.get(trackId);
    if (!votes) {
      votes = new Set();
      room.trackVotes.set(trackId, votes);
    }

    if (votes.has(user.id)) {
      votes.delete(user.id);
    } else {
      votes.add(user.id);
    }

    this.sortUpcomingByVotes(room);
    this.broadcastQueueUpdated(room.id);
  }

  nextTrack(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.skipVotes.clear();

    if (room.currentIndex + 1 < room.queue.length) {
      room.currentIndex += 1;
      room.elapsed = 0;
      room.startedAt = Date.now();
      room.playbackState = "playing";
    } else if (room.queue.length > 0) {
      room.currentIndex = room.queue.length - 1;
      room.elapsed = 0;
      room.playbackState = "paused";
      room.startedAt = Date.now();
    } else {
      room.currentIndex = -1;
      room.elapsed = 0;
      room.playbackState = "paused";
      room.startedAt = Date.now();
    }

    this.broadcastQueueUpdated(room.id);
    this.broadcastPlaybackSync(room.id);
    this.broadcastToRoom(room.id, {
      type: "skip:votes",
      current: room.skipVotes.size,
      needed: this.getSkipNeeded(room),
    });
  }

  chat(userId, text) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room, user } = located;
    const message = safeText(text, "", 500);
    if (!message) {
      return;
    }

    this.broadcastToRoom(room.id, {
      type: "chat:message",
      userId: user.id,
      userName: user.name,
      text: message,
      timestamp: Date.now(),
    });
  }

  setCrossfade(userId, duration) {
    const located = this.findByUser(userId);
    if (!located) {
      return;
    }

    const { room } = located;
    const numeric = Number(duration);
    if (!Number.isFinite(numeric)) {
      return;
    }

    room.crossfadeDuration = Math.min(
      8,
      Math.max(0, Math.round(numeric * 10) / 10),
    );
    this.broadcastToRoom(room.id, {
      type: "crossfade:updated",
      duration: room.crossfadeDuration,
    });
  }

  serializeRoom(room) {
    const elapsed =
      room.playbackState === "playing"
        ? Math.max(0, (Date.now() - room.startedAt) / 1000)
        : Math.max(0, room.elapsed);

    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      queue: this.serializeQueue(room),
      currentIndex: room.currentIndex,
      playbackState: room.playbackState,
      elapsed,
      startedAt: room.startedAt,
      users: Array.from(room.users.values()),
      skipVotes: room.skipVotes.size,
      skipNeeded: this.getSkipNeeded(room),
      crossfadeDuration: room.crossfadeDuration,
    };
  }

  serializeQueue(room) {
    return room.queue.map((track) => ({
      ...track,
      votes: room.trackVotes.get(track.id)?.size || 0,
    }));
  }

  sortUpcomingByVotes(room) {
    const splitIndex = Math.max(-1, room.currentIndex);
    const head = room.queue.slice(0, splitIndex + 1);
    const tail = room.queue.slice(splitIndex + 1);

    tail.sort((first, second) => {
      const firstVotes = room.trackVotes.get(first.id)?.size || 0;
      const secondVotes = room.trackVotes.get(second.id)?.size || 0;
      if (secondVotes !== firstVotes) {
        return secondVotes - firstVotes;
      }
      return (first.addedAt || 0) - (second.addedAt || 0);
    });

    room.queue = [...head, ...tail];
  }

  broadcastQueueUpdated(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    this.broadcastToRoom(room.id, {
      type: "queue:updated",
      queue: this.serializeQueue(room),
      currentIndex: room.currentIndex,
    });
  }

  broadcastPlaybackSync(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const elapsed =
      room.playbackState === "playing"
        ? Math.max(0, (Date.now() - room.startedAt) / 1000)
        : Math.max(0, room.elapsed);

    this.broadcastToRoom(room.id, {
      type: "playback:sync",
      state: room.playbackState,
      currentIndex: room.currentIndex,
      elapsed,
      timestamp: Date.now(),
    });
  }

  broadcastToRoom(roomId, payload, excludeUserId = null) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    for (const userId of room.users.keys()) {
      if (excludeUserId && userId === excludeUserId) {
        continue;
      }
      this.sendTo(userId, payload);
    }
  }

  sendTo(userId, payload) {
    const connection = this.connections.get(userId);
    if (!connection) {
      return;
    }

    try {
      connection.ws.send(JSON.stringify(payload));
    } catch {
      this.leaveRoom(userId);
    }
  }

  findByUser(userId) {
    const connection = this.connections.get(userId);
    if (!connection) {
      return null;
    }

    const room = this.rooms.get(connection.roomId);
    if (!room) {
      return null;
    }

    const user = room.users.get(userId);
    if (!user) {
      return null;
    }

    return { room, user, ws: connection.ws };
  }

  getSkipNeeded(room) {
    return Math.max(1, Math.ceil(room.users.size / 2));
  }

  chatSystem(roomId, text) {
    this.broadcastToRoom(roomId, {
      type: "chat:message",
      userId: "system",
      userName: "System",
      text,
      timestamp: Date.now(),
    });
  }
}
