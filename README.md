# HabitatMQ

**Self-hosted smart enclosure monitoring for reptiles, amphibians, and aquariums — running on a Raspberry Pi.**

HabitatMQ gives you a real-time dashboard to track temperature, humidity, lighting schedules, feeding logs, weight trends, and inhabitant profiles for your animals. Built to run locally on a Pi with no cloud dependency.

> Built for a Western Hognose Snake. Adapted for fish tanks, lizard enclosures, and anything in between.

---

## Features

- 📊 **Real-time sensor dashboard** — temperature, humidity, with trend charts and threshold alerts
- 🐍 **Multi-inhabitant profiles** — reptile and aquarium support, weight tracking, growth percentiles
- 📅 **Care log** — feeding, handling, shedding, cleaning events with a calendar view
- 🎛️ **PID controls** — closed-loop temperature control with configurable setpoints
- 📷 **Photo uploads** — attach photos to care events, full-screen lightbox
- 📡 **MQTT telemetry** — sensor data ingested via MQTT broker
- 📹 **Camera & motion detection** — zone-based activity tracking via OpenCV
- 🔔 **Alert system** — configurable warning/critical thresholds with notification history
- 📱 **Mobile-first UI** — designed for iPhone viewport, works great on any phone browser

---

## Hardware

| Component | Details |
|-----------|---------|
| **Computer** | Raspberry Pi 4 (2GB+ RAM recommended) |
| **OS** | Raspberry Pi OS Lite (64-bit) |
| **Sensors** | DHT22 / BME280 (temp + humidity), any MQTT-capable sensor |
| **Camera** | Raspberry Pi Camera Module (optional) |
| **Heating** | Any PWM-controllable relay or SSR |

---

## Stack

- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Framer Motion, Recharts
- **Backend**: Next.js API routes
- **Database**: SQLite via `better-sqlite3`
- **Telemetry**: MQTT (`mqtt.js`)
- **Deployment**: Docker (cross-compiled for ARM64) → rsync to Pi

---

## Quick Start

### Prerequisites

- Docker Desktop with `buildx` (for ARM64 cross-compilation)
- Raspberry Pi running on your local network
- SSH access to the Pi
- Node.js 20+ (for local dev only)

### Local development

```bash
git clone https://github.com/jonchen727/HabitatMQ.git
cd HabitatMQ
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

By default the app runs against a local SQLite database at `data/enclosure.db` (auto-created on first run). No MQTT broker required for basic UI development — sensor widgets will show empty state.

### Environment variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | MQTT broker address |
| `MQTT_TOPIC_PREFIX` | `enclosure` | Topic prefix for sensor data |
| `PORT` | `3000` | HTTP port |

---

## Deploying to Raspberry Pi

HabitatMQ uses a **local Docker cross-compilation** workflow — the Pi never runs a build. See [DEPLOY.md](DEPLOY.md) for full instructions.

The short version:
1. Build locally in Docker targeting `linux/arm64`
2. Extract `.next/` + `node_modules/` from the container
3. `rsync` to the Pi
4. `systemctl restart habitatmq`

---

## Adapting for Your Animal

HabitatMQ supports multiple profile types out of the box:

- **`reptile`** — snake/lizard care types (feeding, shedding, handling, bedding, cleaning)
- **`aquarium`** — fish/aquatic care types (water change, feeding, testing, dosing, equipment)

When adding an inhabitant, select the profile type that matches your enclosure. The care log, stats, and alerts adapt automatically.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs welcome.

---

## License

**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**

- ✅ Free for personal and hobbyist use
- ✅ Fork and modify — just keep the same license
- ❌ Commercial use prohibited

See [LICENSE](LICENSE) for full terms.
