# HabitatMQ

**Self-hosted smart enclosure monitoring for reptiles, amphibians, and aquariums — built for a Raspberry Pi.**

HabitatMQ is a mobile-first dashboard that puts real-time sensor data, animal profiles, feeding logs, lighting schedules, and PID temperature control in your pocket. No cloud. No subscriptions. Runs entirely on your local network.

> Originally built for Aspen, a Western Hognose Snake. Designed to adapt to any enclosure.

---

## Screenshots

<table>
  <tr>
    <td align="center"><b>Dashboard</b></td>
    <td align="center"><b>Sensor History</b></td>
    <td align="center"><b>Controls</b></td>
  </tr>
  <tr>
    <td><img src="public/screenshots/home.png" width="220"/></td>
    <td><img src="public/screenshots/history.png" width="220"/></td>
    <td><img src="public/screenshots/controls.png" width="220"/></td>
  </tr>
  <tr>
    <td align="center"><b>Care Log</b></td>
    <td align="center"><b>Inhabitants</b></td>
    <td align="center"><b>Config</b></td>
  </tr>
  <tr>
    <td><img src="public/screenshots/care.png" width="220"/></td>
    <td><img src="public/screenshots/inhabitants.png" width="220"/></td>
    <td><img src="public/screenshots/config.png" width="220"/></td>
  </tr>
</table>

---

## Page Documentation

| Page | Description |
|------|-------------|
| [Dashboard](docs/dashboard.md) | Live sensor gauges, device controls, Pi system stats |
| [Sensor History](docs/history.md) | Time-series charts — 1H / 6H / 24H / 7D |
| [Controls](docs/controls.md) | Device management — on/off/auto, solar schedule, PID |
| [Care Log](docs/care.md) | Feeding, shedding, handling, weight log with calendar |
| [Inhabitants](docs/inhabitants.md) | Animal profiles, weight tracking, growth percentile |
| [Config](docs/config.md) | Sensors, MQTT, cameras, location, alert thresholds |
| [Alerts](docs/alerts.md) | Threshold violation history and alert configuration |

---

## Features

| Feature | Details |
|---------|---------|
| 🌡️ **Live sensor dashboard** | Real-time temperature & humidity gauges with color-coded status |
| 📈 **Sensor history** | 1H / 6H / 24H / 7D charts with threshold reference lines |
| 🎛️ **Device controls** | On/Off/Auto modes, solar schedule (sunrise/sunset), PID setpoint |
| 📅 **Care log** | Calendar view with per-animal feeding, shedding, handling, cleaning events |
| 🐍 **Inhabitant profiles** | Reptile and aquarium types, weight tracking, growth percentile |
| 📷 **Photo log** | Attach photos to care events with full-screen lightbox |
| 🔔 **Alerts** | Configurable warning/critical thresholds with alert history |
| 📡 **MQTT telemetry** | Standard MQTT broker — works with ESPHome, Tasmota, custom sensors |
| 📱 **Mobile-first** | Designed for iPhone; works on any phone browser on your local network |

---

## Hardware

| Component | Recommended |
|-----------|-------------|
| **Computer** | Raspberry Pi 4 (2GB+ RAM) |
| **OS** | Raspberry Pi OS Lite 64-bit |
| **Sensors** | DHT22, BME280, or any MQTT-publishing sensor |
| **Camera** | Pi Camera Module v2/v3 (optional) |
| **Heating** | SSR or PWM relay for PID control |

---

## Tech Stack

- **Frontend** — Next.js 15 (App Router), Tailwind CSS, Framer Motion, Recharts
- **Backend** — Next.js API routes, SQLite via `better-sqlite3`
- **Telemetry** — MQTT (`mqtt.js`)
- **Motion detection** — OpenCV frame-differencing (Python, optional)
- **Deployment** — Docker cross-compiled for ARM64 → rsync to Pi

---

## Quick Start (Local Dev)

```bash
git clone https://github.com/jonchen727/HabitatMQ.git
cd HabitatMQ
npm install
cp .env.example .env.local   # configure MQTT broker URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database is created automatically at `data/enclosure.db` on first run. No MQTT broker required for basic UI development.

---

## MQTT Sensor Format

Publish sensor readings to `{MQTT_TOPIC_PREFIX}/{sensor_id}` as JSON:

```json
{ "temperature": 87.2, "humidity": 45.1, "unit": "F" }
```

HabitatMQ maps incoming topics to sensor widgets via the Config page. Supports any MQTT-compatible sensor (ESPHome, Tasmota, custom Arduino/ESP32).

---

## Adapting for Your Animal

Select a profile type when adding an inhabitant — the care log, stats, and alert labels adapt automatically.

| Profile | Care event types |
|---------|-----------------|
| **Reptile** | Feeding, Shedding, Handling, Cleaning, Bedding change, Vet visit |
| **Aquarium** | Water change, Feeding, Water test, Dosing, Equipment check |

Multi-enclosure support is built-in — switch between animals using the top navigation picker.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | MQTT broker address |
| `MQTT_TOPIC_PREFIX` | `enclosure` | Topic prefix for sensor data |
| `PORT` | `3000` | HTTP port |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs welcome — especially for new animal profiles and sensor integrations.

---

## License

**CC BY-NC-SA 4.0** — free for personal and hobbyist use, no commercial use, forks must keep the same license. See [LICENSE](LICENSE).
