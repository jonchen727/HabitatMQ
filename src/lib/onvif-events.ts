/**
 * ONVIF Event Listener — Subscribes to camera motion events via ONVIF PullMessages.
 *
 * Uses the `onvif` package directly for PullPoint subscription lifecycle.
 * Motion events are published to MQTT and emitted to a callback registry.
 *
 * This replaces CPU-heavy OpenCV frame-differencing for cameras that support ONVIF events.
 * The camera's built-in motion detector does the heavy lifting — we just listen.
 */

import type { CameraDef } from "@/lib/schema";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Cam = require("onvif").Cam;

const MOTION_TOPIC = /RuleEngine\/CellMotionDetector\/Motion/;

// Track active listeners by cameraId
const activeListeners = new Map<string, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cam: any;
  pollTimer: ReturnType<typeof setTimeout> | null;
  lastMotion: boolean;
  lastEventTime: number;
  cooldownMs: number;
  stopped: boolean;
}>();

// Event callback registry — components can subscribe to motion events
type MotionCallback = (cameraId: string, motion: boolean, timestamp: number) => void;
const motionCallbacks: MotionCallback[] = [];

export function onMotionEvent(cb: MotionCallback): () => void {
  motionCallbacks.push(cb);
  return () => {
    const idx = motionCallbacks.indexOf(cb);
    if (idx >= 0) motionCallbacks.splice(idx, 1);
  };
}

function emitMotion(cameraId: string, motion: boolean) {
  const ts = Date.now();
  for (const cb of motionCallbacks) {
    try { cb(cameraId, motion, ts); } catch { /* best effort */ }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMotionFromMessages(messages: any): { motion: boolean; found: boolean } {
  if (!messages) return { motion: false, found: false };

  // Handle single message or array
  const list = Array.isArray(messages) ? messages : [messages];
  for (const nm of list) {
    const topic = nm?.topic?._?.toString() ?? "";
    if (!MOTION_TOPIC.test(topic)) continue;

    // Try simpleItem as array (Tapo returns array of simpleItems)
    const simpleItems = nm?.message?.message?.data?.simpleItem;
    if (Array.isArray(simpleItems)) {
      for (const item of simpleItems) {
        if (item?.$?.Name === "IsMotion") {
          const val = item.$.Value;
          return { motion: val === true || val === "true" || val === "1", found: true };
        }
      }
    }

    // Fallback: single simpleItem
    const val = simpleItems?.$?.Value;
    if (val !== undefined) {
      return { motion: val === true || val === "true" || val === "1", found: true };
    }
  }
  return { motion: false, found: false };
}

/**
 * Start an ONVIF motion event listener for a camera.
 *
 * Uses manual PullPoint subscription + polling because many cameras (e.g. Tapo C120)
 * don't advertise event service capabilities, which causes the onvif library's
 * cam.on("event") auto-subscription to silently do nothing.
 */
export async function startMotionListener(camera: CameraDef): Promise<boolean> {
  const { motionDetection, id, username, password, url } = camera;
  if (!motionDetection?.enabled) return false;

  // Don't double-start
  if (activeListeners.has(id)) {
    console.log(`[onvif-events] listener already active for ${id}`);
    return true;
  }

  // Extract IP from the camera URL
  const ipMatch = url.match(/(?:rtsp|http|https):\/\/(?:[^@]+@)?([^/:]+)/);
  const hostname = ipMatch?.[1];
  if (!hostname) {
    console.error(`[onvif-events] cannot extract IP from url for camera ${id}`);
    return false;
  }

  const cooldownMs = (motionDetection.cooldownSeconds ?? 30) * 1000;

  return new Promise<boolean>((resolve) => {
    try {
      const cam = new Cam({
        hostname,
        port: camera.onvifPort ?? 2020,
        username: username ?? "",
        password: password ?? "",
      }, (err: unknown) => {
        if (err) {
          console.error(`[onvif-events] failed to connect to ${id} (${hostname}):`, err);
          resolve(false);
          return;
        }


        const state = {
          cam,
          pollTimer: null as ReturnType<typeof setTimeout> | null,
          lastMotion: false,
          lastEventTime: 0,
          cooldownMs,
          stopped: false,
        };

        activeListeners.set(id, state);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processEvent = (message: any) => {
          const { motion, found } = extractMotionFromMessages(message);
          if (!found) return;

          const now = Date.now();

          // Debounce rapid events
          if (now - state.lastEventTime < state.cooldownMs && motion === state.lastMotion) {
            return;
          }

          state.lastMotion = motion;
          state.lastEventTime = now;

          console.log(`[onvif-events] ${id}: motion=${motion}`);
          emitMotion(id, motion);

          // Publish to MQTT if configured
          if (motionDetection.mqttTopic) {
            publishMotionToMqtt(motionDetection.mqttTopic, id, motion, now).catch(() => {});
          }
        };

        // Track renewal timer so we can clean it up
        let renewTimer: ReturnType<typeof setInterval> | null = null;

        // Clean up old subscription before creating a new one
        const cleanupSubscription = () => {
          if (renewTimer) {
            clearInterval(renewTimer);
            renewTimer = null;
          }
          try {
            cam.unsubscribe(() => {}, true); // best-effort, preserve event listeners
          } catch {
            // ignore — subscription may already be dead
          }
        };

        // Create subscription and start continuous long-poll loop
        const startPolling = () => {
          if (state.stopped) return;

          // Always clean up before re-subscribing to avoid orphaned subscriptions
          // that exhaust the camera's PullPoint slot limit (Tapo C120 max ~10)
          cleanupSubscription();

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cam.createPullPointSubscription((subErr: any) => {
            if (state.stopped) return;
            if (subErr) {
              console.error(`[onvif-events] PullPoint subscription failed for ${id}:`, subErr.message);
              state.pollTimer = setTimeout(startPolling, 10000);
              return;
            }

            console.log(`[onvif-events] started PullPoint listener for ${id} (${hostname}:${camera.onvifPort})`);

            // Renew subscription every 60s to prevent TTL expiry (Tapo TTL = ~120s)
            renewTimer = setInterval(() => {
              if (state.stopped) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cam.renew({}, (renewErr: any) => {
                if (renewErr) {
                  console.warn(`[onvif-events] renew failed for ${id}, will re-subscribe on next pull error`);
                }
              });
            }, 60_000);

            longPoll();
          });
        };

        // Continuous long-poll: each pullMessages returns when there's an event
        // or after 5s timeout (patched from 1m). On error, re-subscribe.
        const longPoll = () => {
          if (state.stopped) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cam.pullMessages({}, (pullErr: any, data: any) => {
            if (state.stopped) return;

            if (pullErr) {
              // Connection dropped — clean up and re-subscribe after brief delay
              state.pollTimer = setTimeout(startPolling, 3000);
              return;
            }

            // data is the parsed pullMessagesResponse from the onvif library
            // It contains notificationMessage with event data
            const nm = data?.notificationMessage;
            if (nm) {
              processEvent(nm);
            }

            // Immediately long-poll again (no delay — the pull itself is the wait)
            longPoll();
          });
        };

        startPolling();
        resolve(true);
      });
    } catch (err) {
      console.error(`[onvif-events] failed to create Cam for ${id}:`, err);
      resolve(false);
    }
  });
}

/**
 * Stop an ONVIF motion event listener.
 */
export function stopMotionListener(cameraId: string): void {
  const entry = activeListeners.get(cameraId);
  if (!entry) return;

  entry.stopped = true;
  if (entry.pollTimer) clearTimeout(entry.pollTimer);

  try {
    entry.cam.unsubscribe(() => {});
  } catch { /* best effort */ }

  try {
    entry.cam.removeAllListeners("event");
  } catch { /* best effort */ }

  activeListeners.delete(cameraId);
  console.log(`[onvif-events] stopped listener for ${cameraId}`);
}

/**
 * Sync all ONVIF event listeners with the DB.
 * Called on server startup.
 */
export async function syncMotionListeners(): Promise<void> {
  try {
    const { listCameras } = await import("@/lib/db");
    const cameras = listCameras();
    let started = 0;

    for (const cam of cameras) {
      if (cam.enabled && cam.motionDetection?.enabled) {
        const ok = await startMotionListener(cam);
        if (ok) started++;
      }
    }

    console.log(`[onvif-events] synced ${started} motion listener(s)`);
  } catch (err) {
    console.error("[onvif-events] sync failed:", err);
  }
}

/**
 * Get the current motion state for all cameras with active listeners.
 */
export function getMotionStates(): Record<string, { motion: boolean; lastEvent: number }> {
  const states: Record<string, { motion: boolean; lastEvent: number }> = {};
  for (const [id, entry] of activeListeners) {
    states[id] = {
      motion: entry.lastMotion,
      lastEvent: entry.lastEventTime,
    };
  }
  return states;
}

/**
 * Check if a specific camera's ONVIF event service is active.
 */
export function isListenerActive(cameraId: string): boolean {
  return activeListeners.has(cameraId);
}

// ── MQTT Publishing ──────────────────────────────────────────────────────────

async function publishMotionToMqtt(
  topic: string,
  cameraId: string,
  motion: boolean,
  timestamp: number,
): Promise<void> {
  try {
    const { publishMqtt } = await import("@/lib/mqtt-server");
    publishMqtt(topic, JSON.stringify({
      cameraId,
      motion,
      timestamp,
      source: "onvif",
    }));
  } catch {
    // MQTT not available — that's fine
  }
}
