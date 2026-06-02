# Sensor History

The History page shows time-series charts of your enclosure's sensor readings. Use it to spot temperature drift, identify heating failures, or verify your gradient is stable over time.

<img src="../public/screenshots/history.png" width="320" alt="Sensor History screenshot"/>

---

## Time Range Selector

Four time windows are available via the pill buttons at the top:

| Button | Window | Data source |
|--------|--------|----------------|
| **1H** | Last 1 hour | Raw readings (~1/min) |
| **6H** | Last 6 hours | Raw readings (~1/min) |
| **24H** | Last 24 hours | Hourly rollup averages + raw |
| **7D** | Last 7 days | Hourly rollup averages |

Longer windows use pre-computed hourly rollup tables to keep charts responsive. Raw per-minute data and rollup data are merged seamlessly via UNION ALL queries. All data is fetched in a single batch request (`/api/history/batch`).

---

## Sensor Toggles

Each configured sensor appears as a toggleable chip below the time selector. Tap to show or hide that sensor's line on the chart. Active sensors are highlighted.

| Sensor | Color |
|--------|-------|
| Hot Side Substrate | 🟠 Orange |
| Cold Side Substrate | 🔵 Cyan |
| Additional sensors | Auto-assigned |

---

## Chart

The area chart shows temperature over time with:

- **Filled area** under each line — makes gradient spread visually obvious
- **Smooth curve** — moving-average smoothing (window size scales with time range) reduces visual noise from sensor jitter
- **Y-axis** — scaled to your configured min/max thresholds, not auto-zoomed
- **Threshold reference lines** — toggle the ⚠ button to show/hide dashed lines at warning (yellow) and critical (red) levels
- **Spike filtering** — readings that drop >30% from the previous value are suppressed (catches sensor disconnects)

### Enriched Tooltips

Hover (or tap on mobile) any point on the chart to see an enriched tooltip showing:

- **Timestamp** and current sensor values
- **Control states** — which devices (basking light, heat pad, etc.) are on or off at that moment, with color-coded badges
- **Motion snapshot** — if an ONVIF camera detected motion at that timestamp, a thumbnail of the captured frame is shown inline

### Reading a healthy gradient

A well-maintained enclosure should show:
- Hot side holding steady at setpoint (e.g. 87–90°F)
- Cold side in a stable cooler range (e.g. 68–72°F)
- Both lines flat with minimal oscillation

### Spotting problems

| Pattern | Possible cause |
|---------|---------------|
| Hot side dropping toward cold | Heat pad off or failed |
| Both sides rising together | Ambient temperature spike |
| Rapid oscillations | PID tuning too aggressive |
| Flat line at 0 | Sensor disconnected / MQTT not publishing |

---

## Activity Timeline

Below the chart, **device activity strips** show when each control device was on or off, aligned to the same time axis. This makes it easy to correlate temperature changes with device state changes.

Each control gets its own strip with color-coded bands and an icon indicator — inspired by the iOS battery usage chart.

- **Icon centered in band** — appears when the ON period is wide enough to render
- **Trailing icon** — pulses at the right edge when the device is currently ON
- **Color** — matches the device's configured color (or auto-assigned from a palette)

---

## Motion Detection Timeline

When ONVIF cameras with motion detection are configured, a **motion strip** appears below the control strips. Each motion band represents a period where the camera detected movement.

- **Rose/red bands** — periods of active motion
- **👁 Eye icon** — centered in wider bands; pulses at the right edge during active motion
- **Tap a band** — shows a popup with the captured snapshot from that motion event
- **Snapshot filmstrip** — 1fps screenshots are captured during each motion event and stored locally

Motion data is auto-discovered from configured ONVIF cameras — no additional setup needed beyond adding the camera in Config.

---

## Alert Indicators

The ⚠ icon in the top-right corner of the chart card appears when one or more readings in the selected window exceeded a threshold. Tap it to jump to the Alerts page.

---

## Data Storage

All sensor readings are stored locally in SQLite at `data/enclosure.db` in two tables:

| Table | Purpose |
|-------|----------|
| `sensor_readings` | Raw per-minute readings from MQTT |
| `sensor_rollups` | Pre-computed hourly averages (min/max/avg/count) |

Write throttling limits storage to 1 write per 5 seconds per sensor. An in-memory LRU cache reduces repeated reads for the same time windows.

There is no data retention limit by default — readings accumulate indefinitely. If disk space becomes a concern on your Pi, add a cron job to prune old rows:

```sql
DELETE FROM sensor_readings WHERE recorded_at < datetime('now', '-90 days');
DELETE FROM sensor_rollups WHERE hour < datetime('now', '-180 days');
```

Motion detection snapshots are stored in `data/motion-snapshots/` as JPEG files, organized by camera ID and timestamp.
