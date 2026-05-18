# Getting Started

Three ways to run HabitatMQ — pick the one that fits your setup.

---

## 1. Docker Compose (Recommended)

The fastest path. Runs HabitatMQ + an MQTT broker with one command.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker Engine (Linux)
- Docker Compose v2+

### Steps

```bash
# Clone the repo
git clone https://github.com/jonchen727/HabitatMQ.git
cd HabitatMQ

# Start everything
docker compose up -d
```

Open [http://localhost:3003](http://localhost:3003) — the dashboard is ready.

### What's running

| Service | Port | Description |
|---------|------|-------------|
| HabitatMQ | 3003 | Dashboard + API |
| Mosquitto | 1883 | MQTT broker (TCP) |
| Mosquitto | 1880 | MQTT broker (WebSocket) |

### Data persistence

Your data lives in `./data/enclosure.db` (SQLite) and `./uploads/` (photos). These are mounted as Docker volumes so they survive container restarts and upgrades.

### Stopping

```bash
docker compose down        # Stop containers (data preserved)
docker compose down -v     # Stop + delete volumes (⚠️ deletes data)
```

---

## 2. Raspberry Pi Deployment

Run HabitatMQ on a Raspberry Pi for a dedicated, always-on enclosure monitor.

### Hardware

| Component | Recommended |
|-----------|-------------|
| Computer | Raspberry Pi 4 or 5 (2GB+ RAM) |
| OS | Raspberry Pi OS Lite 64-bit |
| Sensors | DHT22, BME280, or any MQTT-publishing sensor |
| Camera | Any RTSP/ONVIF IP camera (e.g., Tapo C120) |
| Heating | SSR or PWM relay for PID control (optional) |

### Install Docker on Pi

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then:
docker compose version   # Verify
```

### Deploy

```bash
git clone https://github.com/jonchen727/HabitatMQ.git
cd HabitatMQ
docker compose up -d
```

The ARM64 image is pre-built — Docker pulls the correct architecture automatically.

### Optional: go2rtc for cameras

If you have RTSP/ONVIF cameras, create a `go2rtc.yaml`:

```yaml
api:
  listen: ":1984"
  origin: "*"

rtsp:
  listen: ":8554"

streams:
  my-camera:
    - rtsp://username:password@192.168.1.x:554/stream1
```

Then uncomment the `go2rtc` service in `docker-compose.yml` and restart:
```bash
docker compose up -d
```

Add the camera in HabitatMQ's Config page — it will auto-discover ONVIF cameras on your network.

### Optional: Cloudflare Tunnel (remote access)

Access your dashboard from anywhere without port forwarding:

```bash
# Install cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Create a tunnel (follow the interactive setup)
cloudflared tunnel login
cloudflared tunnel create habitatmq
cloudflared tunnel route dns habitatmq your-subdomain.yourdomain.com

# Run it
cloudflared tunnel run --url http://localhost:3003 habitatmq
```

---

## 3. Local Development

For contributing or customizing.

### Prerequisites
- Node.js 20+ (22 recommended)
- npm 10+

### Steps

```bash
git clone https://github.com/jonchen727/HabitatMQ.git
cd HabitatMQ

npm install
cp .env.example .env.local   # Edit to configure MQTT broker URL

npm run dev
```

Open [http://localhost:3003](http://localhost:3003). The SQLite database is created automatically on first run. No MQTT broker is required for basic UI development — sensor widgets will show "No data" until a broker publishes readings.

### Project structure

```
src/
├── app/              # Next.js App Router pages
│   ├── api/          # REST API routes
│   ├── care/         # Care log page
│   ├── config/       # Configuration page
│   ├── controls/     # Device controls page
│   ├── history/      # Sensor history charts
│   ├── inhabitants/  # Animal profiles
│   └── alerts/       # Alert history
├── components/       # Reusable UI components
├── lib/              # Database, MQTT, utilities
├── providers/        # React context providers
└── store/            # Zustand state stores
```

---

## Adding Your First Sensor

1. Set up an MQTT-publishing sensor (ESPHome, Tasmota, or custom Arduino/ESP32)
2. Configure it to publish to `enclosure/{sensor_id}` as JSON:
   ```json
   { "temperature": 87.2, "humidity": 45.1, "unit": "F" }
   ```
3. In the HabitatMQ Config page, add a sensor and map it to the MQTT topic
4. The dashboard will show live readings immediately

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | MQTT broker address |
| `MQTT_TOPIC_PREFIX` | `enclosure` | Topic prefix for sensor data |
| `PORT` | `3003` | HTTP server port |
| `GO2RTC_HOST` | `localhost` | go2rtc API host (camera streaming) |
| `GO2RTC_PORT` | `1984` | go2rtc API port |
| `DATA_DIR` | `./data` | SQLite database directory |

---

## Need Help?

- [Bug reports](https://github.com/jonchen727/HabitatMQ/issues) — use the Bug Report template
- [Feature requests](https://github.com/jonchen727/HabitatMQ/issues) — use the Feature Request template
- [Contributing guide](CONTRIBUTING.md)
