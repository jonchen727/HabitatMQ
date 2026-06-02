# Changelog

All notable changes to HabitatMQ are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versions use [CalVer](https://calver.org/) — `YYYY.MM.patch`.

---

## [2026.06.0] — 2026-06-02

### Added
- **Motion detection timeline** — Real-time motion event strip on the sensor history chart with 1fps screenshot capture from ONVIF cameras. Tap a motion band to see the captured frame.
- **Enriched chart tooltips** — Sensor history tooltips now show which controls are on/off at the hovered timestamp, plus a motion snapshot thumbnail when motion was active.
- **Per-event weight assessment** — Measurement cards in the care log now show individual growth percentile callouts based on the animal's weight and age at the time of that specific measurement.
- **Daily temperature extremes** — Care page shows a hot/cold side daily high ↑ / low ↓ / avg strip for each selected day, making it easy to spot overnight temperature drops.
- **Observation events** — Feeding observation (lump status, regurgitation), behavior observation (temperament), and medical observation categories with automatic linkage to recent feedings.

### Performance
- **Sensor history overhaul** — Write throttling (1 write/5s per sensor), batch API (`/api/history/batch`), hourly rollup tables, in-memory LRU cache, and daily extremes endpoint. Chart loads 3–5× faster on 7-day views.
- **Care page optimization** — Parallel fetch of events + stats + extremes eliminates the loading waterfall. Server-side response caching reduces API latency.

### Fixed
- Care page temperatures now display in °F (was showing raw °C from the sensor).
- 0°C sensor glitch readings (disconnected probe) filtered out of daily extremes.
- 7-day chart falls back to rollup data when raw per-minute data is sparse.
- Control status strip shows correct state for controls that were ON for the entire visible time range.
- Motion snapshot popup positioning fixed for touch devices (was clipped off-screen).
- Motion snapshot capture uses go2rtc frame API instead of direct RTSP for reliability.
- Merged raw + rollup sensor tables via UNION ALL for seamless time-range queries.

---

## [2026.05.3] — 2026-05-18

### Fixed
- **Cloudflare Tunnel streaming** — MSE video streams now work through Cloudflare Tunnel. Added a WebSocket proxy (`server.js`) that routes go2rtc traffic through the Next.js server on port 3003, eliminating the need to expose port 1984 externally.

### Infrastructure
- Custom Node.js server (`server.js`) wraps Next.js with WebSocket upgrade proxying for go2rtc.
- Dockerfile and systemd service updated to use `node server.js` instead of `next start`.

---

## [2026.05.2] — 2026-05-15

### Added
- **Observation events** — New care event type for tracking feeding observations (visible lump, regurgitation) with automatic linkage to the most recent feeding.
- **Digestion status chip** — Care stats banner shows current digestion state based on linked observations.
- **Observation filter pill** — Quick filter on the care page to isolate observation-type events.

### Fixed
- Photo uploads moved to persistent storage outside the app directory — survives redeployments.
- Feeding size tips (visible lump guidance) moved from passive display to editor-only context.

---

## [2026.05.1] — 2026-05-14

### Added
- **go2rtc integration** — Replaced ffmpeg transcoding with go2rtc for zero-transcode RTSP streaming. Massive CPU reduction on Raspberry Pi.
- **ONVIF auto-discovery** — Cameras are discovered automatically on the local network with WS-Security digest auth.
- **Motion detection** — Real-time motion events via ONVIF PullPoint long-polling with visual indicator on the stream widget.
- **Camera picker** — Select camera source per dashboard pane with RTSP auto-detection and credential hiding.

### Fixed
- iOS Safari crash resolved — `ManagedMediaSource` fallback for browsers that don't support `MediaSource` directly.
- MSE player rewritten to match go2rtc reference implementation — fixes codec negotiation, FLAC audio, race conditions.
- ONVIF motion detection stabilized — PullPoint timeout patched from 60s to 5s to prevent socket hang-ups on Tapo cameras.
- Stream re-registration bug fixed — prevents killing active consumers when re-adding existing streams.
- MJPEG URL stabilized to prevent reconnection loops.

---

## [2026.05.0] — 2026-05-10

### Added
- **Multi-photo uploads** — Attach multiple photos to care events with full-screen lightbox viewer.
- **Auto-compress photos** — Uploaded images automatically converted to WebP via `sharp` for storage efficiency.
- **Open source release** — README, CONTRIBUTING, LICENSE (CC BY-NC-SA 4.0), screenshots, per-page documentation.

### Fixed
- iOS Safari date/time picker icons restored.
- WebKit grid overflow on input elements resolved.
- Phantom scroll on short pages eliminated.

### Performance
- Replaced `next/image` with plain `<img>` for user uploads — eliminates unnecessary image optimization overhead on Pi.
