FROM node:22-slim AS builder
WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --maxsockets=4

# Patch onvif library: reduce PullMessages timeout from PT1M (60s) to PT5S (5s)
# Tapo C120 cameras drop HTTP connections during 60s long-poll causing "socket hang up"
RUN sed -i "s/<Timeout>PT1M<\/Timeout>/<Timeout>PT5S<\/Timeout>/g" node_modules/onvif/lib/events.js \
 && sed -i "s/replyTimeout: (80 \* 1000)/replyTimeout: (15 * 1000)/" node_modules/onvif/lib/events.js

COPY . .
RUN npx next build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# ffmpeg + ffprobe for RTSP→MJPEG transcoding and camera probing
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy built app and node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/CHANGELOG.md ./CHANGELOG.md

EXPOSE 3003
CMD ["node", "server.js"]
