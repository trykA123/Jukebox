FROM oven/bun:1

WORKDIR /app

COPY server/package.json ./server/package.json
RUN cd server && bun install

COPY server ./server
COPY client ./client

EXPOSE 3000

WORKDIR /app/server
CMD ["bun", "src/index.js"]
