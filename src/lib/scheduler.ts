/**
 * Solar-Aware Schedule + PID Control Engine
 *
 * Runs server-side as a 60-second interval. For each control:
 *  - "on"/"off" mode: heartbeat-publishes the forced state every tick
 *  - "auto" mode (schedule): evaluates schedule (manual/solar/seasonal)
 *  - "auto" mode (pid): runs PID loop to maintain setpoint from input sensor
 *
 * Heartbeat pattern: ALWAYS republishes current output state every 60s
 * so that if Node-RED or MQTT broker restarts, the device recovers.
 *
 * Only logs care events on actual state TRANSITIONS, not heartbeats.
 * On first boot, seeds lastState without logging to prevent phantom events.
 */

import SunCalc from "suncalc";
import { PIDController } from "@mariusrumpf/pid-controller";
import { listControls, getLocation, getSensor, saveCareEvent, updateControl, loadControlTimers, saveControlTimer, logControlStateChange } from "./db";
import { publishMqtt, getLiveData } from "./mqtt-server";
import type { ControlDef, ScheduleDef, SeasonalProfile, CareEvent, PidConfig, SetpointScheduleEntry, SolarSetpointEntry, SeasonalThermalProfile, BrumationOverride } from "./schema";
import { getAutoSeasons, findActiveNaturalSeason, blendSeasonTransition, generateNaturalSetpoints } from "./climate";

// Track last-known state per control to detect transitions
const lastState = new Map<string, boolean>(); // controlId → wasOn

// Track when each control last transitioned (for cycle elapsed display)
const controlTimers = new Map<string, number>(); // controlId → epoch ms (cycleSince)

// Track lifetime on-hours per control (accumulates, editable)
const controlTotalHours = new Map<string, number>(); // controlId → hours

// PID controller instances (persist across ticks for integral/derivative)
const pidControllers = new Map<string, PIDController>();

// PID output percentage (for UI display)
const pidOutputs = new Map<string, number>(); // controlId → 0-100

// Track last setpoint used for each PID controller (to detect changes from scheduling)
const pidLastSetpoints = new Map<string, number>(); // controlId → last setpoint

// PWM window start times for time-proportioning (toggle controls)
const pwmWindowStarts = new Map<string, number>(); // controlId → epoch ms

// Resolved setpoint info (for UI display)
interface ResolvedSetpoint {
  setpoint: number;
  mode: "static" | "daily" | "solar" | "seasonal" | "natural" | "brumation";
  phase: string;
  sensorOffset: number;
}
const pidResolvedSetpoints = new Map<string, ResolvedSetpoint>(); // controlId → resolved

// Auto-tune state
interface AutoTuneState {
  controlId: string;
  setpoint: number;
  outputHigh: boolean;        // current relay state
  peaks: number[];            // process variable peaks
  valleys: number[];          // process variable valleys
  lastCrossing: number;       // timestamp of last setpoint crossing
  periods: number[];          // measured oscillation periods
  cycles: number;             // completed full cycles
  startedAt: number;
}
const autoTuneActive = new Map<string, AutoTuneState>();

let started = false;
let booted = false; // true after first tick seeds lastState
let intervalId: ReturnType<typeof setInterval> | null = null;

/** Start the scheduler (idempotent). */
export function startScheduler() {
  if (started) return;
  started = true;
  console.log("[scheduler] starting (60s interval)");
  // Restore persisted timers from DB
  const persisted = loadControlTimers();
  for (const [id, data] of persisted) {
    controlTimers.set(id, data.since);
    controlTotalHours.set(id, data.totalHours);
  }
  console.log(`[scheduler] restored ${persisted.size} timer(s) from DB`);
  // Run immediately, then every 60s
  tick();
  intervalId = setInterval(tick, 60_000);
  if (intervalId.unref) intervalId.unref();
}

/** Force an immediate scheduler evaluation (called when switching to auto mode). */
export function forceTick() {
  console.log("[scheduler] forced tick (mode change)");
  tick();
}

/** Single evaluation pass across all controls. */
function tick() {
  try {
    const controls = listControls();
    const location = getLocation();

    for (const ctrl of controls) {
      // Determine desired state for this control
      let shouldBeOn: boolean | null = null;
      let pidOutput: number | null = null;

      if (ctrl.mode === "on") {
        shouldBeOn = true;
      } else if (ctrl.mode === "off") {
        shouldBeOn = false;
      } else if (ctrl.mode === "auto") {
        // Check if auto-tuning is active for this control
        if (autoTuneActive.has(ctrl.id)) {
          shouldBeOn = tickAutoTune(ctrl);
        } else if (ctrl.autoStrategy === "pid" && ctrl.pid) {
          const result = evaluatePid(ctrl);
          if (result !== null) {
            pidOutput = result.output;
            shouldBeOn = result.shouldBeOn;
          }
        } else if (ctrl.schedule) {
          shouldBeOn = evaluate(ctrl.schedule, location);
        } else {
          console.warn(`[scheduler] ${ctrl.label}: auto mode but no schedule or PID defined — skipping`);
        }
      }

      if (shouldBeOn === null) continue; // can't determine

      // Publish command to controlTopic only.
      // statusTopic is a READ-BACK topic — the device publishes its state there.
      // We subscribe to it (via sensor config in mqtt-server.ts), never write to it.
      if (ctrl.kind === "pwm" && pidOutput !== null) {
        publishMqtt(ctrl.mqtt.controlTopic, String(Math.round(pidOutput)));
      } else {
        const value = shouldBeOn ? ctrl.mqtt.onValue : ctrl.mqtt.offValue;
        // ── Heartbeat: ALWAYS republish current state ──
        publishMqtt(ctrl.mqtt.controlTopic, value);
      }

      // ── Transition detection: only log on real changes ──
      const wasOn = lastState.get(ctrl.id);

      if (wasOn !== shouldBeOn) {
        const now = Date.now();
        const prevSince = controlTimers.get(ctrl.id) ?? now;
        const prevTotal = controlTotalHours.get(ctrl.id) ?? 0;

        // Accumulate on-hours when transitioning OFF (was on → now off)
        let newTotal = prevTotal;
        if (wasOn === true && !shouldBeOn) {
          newTotal += (now - prevSince) / 3_600_000;
        }

        // First boot: seed state silently (no care event, no log spam)
        // Still publish so auto-mode controls activate immediately without
        // requiring the user to toggle off → auto.
        if (!booted) {
          lastState.set(ctrl.id, shouldBeOn);
          controlTimers.set(ctrl.id, now);
          controlTotalHours.set(ctrl.id, newTotal);
          saveControlTimer(ctrl.id, now, newTotal);
          logControlStateChange(ctrl.id, shouldBeOn);
          // Note: publish already happened above — no continue, fall through to log
          continue;
        }

        console.log(`[scheduler] ${ctrl.label}: ${shouldBeOn ? "ON" : "OFF"} → transition (totalHours: ${newTotal.toFixed(1)})`);
        lastState.set(ctrl.id, shouldBeOn);
        controlTimers.set(ctrl.id, now);
        controlTotalHours.set(ctrl.id, newTotal);
        saveControlTimer(ctrl.id, now, newTotal);
        logControlStateChange(ctrl.id, shouldBeOn);

        // Only log care event for auto-mode transitions (not manual on/off)
        if (ctrl.mode === "auto") {
          // Don't log schedule ON/OFF transitions as care events — too noisy.
          // The schedule times are shown in the control card UI instead.
        }
      }
    }

    // Mark boot complete after first full pass
    if (!booted) {
      booted = true;
      console.log("[scheduler] initial state seeded (no events logged)");
    }
  } catch (err) {
    console.error("[scheduler] tick error:", err);
  }
}

// ─── Timer API for UI ────────────────────────────────────────────────────────

/** Get all control timer data. */
export function getControlTimers(): Record<string, { isOn: boolean; since: number; totalHours: number }> {
  const result: Record<string, { isOn: boolean; since: number; totalHours: number }> = {};
  for (const [id, since] of controlTimers) {
    const isOn = lastState.get(id) ?? false;
    const base = controlTotalHours.get(id) ?? 0;
    // If currently on, include the running cycle time in totalHours
    const running = isOn ? (Date.now() - since) / 3_600_000 : 0;
    result[id] = { isOn, since, totalHours: base + running };
  }
  return result;
}

/** Reset a specific control's timer (zero out total hours). */
export function resetControlTimer(controlId: string) {
  const since = Date.now();
  controlTimers.set(controlId, since);
  controlTotalHours.set(controlId, 0);
  saveControlTimer(controlId, since, 0);
}

/** Set a control's total hours to a specific value. */
export function setControlTimer(controlId: string, hours: number) {
  const since = Date.now();
  controlTimers.set(controlId, since);
  controlTotalHours.set(controlId, hours);
  saveControlTimer(controlId, since, hours);
}

// ─── PID Evaluation ──────────────────────────────────────────────────────────

/** Get or create a PID controller for a control. */
function getOrCreatePid(ctrl: ControlDef): PIDController | null {
  if (!ctrl.pid) return null;

  let controller = pidControllers.get(ctrl.id);
  if (!controller) {
    controller = new PIDController({
      p: ctrl.pid.Kp,
      i: ctrl.pid.Ki,
      d: ctrl.pid.Kd,
      target: ctrl.pid.setpoint,
      sampleTime: 60_000,
      outputMin: 0,
      outputMax: 100,
    });
    pidControllers.set(ctrl.id, controller);
    console.log(`[scheduler] PID created for ${ctrl.label}: sp=${ctrl.pid.setpoint}, Kp=${ctrl.pid.Kp}, Ki=${ctrl.pid.Ki}, Kd=${ctrl.pid.Kd}`);
  }
  return controller;
}

/** Evaluate PID loop for a control. Returns shouldBeOn + raw output. */
function evaluatePid(ctrl: ControlDef): { shouldBeOn: boolean; output: number } | null {
  if (!ctrl.pid) return null;

  const controller = getOrCreatePid(ctrl);
  if (!controller) return null;

  // ── Resolve dynamic setpoint ────────────────────────────────────────────────
  const location = getLocation();
  const now = new Date();
  const resolved = resolveActiveSetpoint(ctrl.pid, now, location);
  const activeSetpoint = resolved.setpoint;

  // Recreate PID controller with active setpoint if it changed
  const lastSp = pidLastSetpoints.get(ctrl.id);
  if (lastSp === undefined || Math.abs(lastSp - activeSetpoint) > 0.05) {
    pidControllers.delete(ctrl.id);
    const newCtrl = new PIDController({
      p: ctrl.pid.Kp, i: ctrl.pid.Ki, d: ctrl.pid.Kd,
      target: activeSetpoint,
      sampleTime: 60_000, outputMin: 0, outputMax: 100,
    });
    pidControllers.set(ctrl.id, newCtrl);
    pidLastSetpoints.set(ctrl.id, activeSetpoint);
  }

  // Read current sensor value from MQTT live cache
  const liveData = getLiveData();
  const sensorReading = liveData[ctrl.pid.inputSensorId];
  if (!sensorReading || typeof sensorReading.value !== "number") {
    console.warn(`[scheduler] PID ${ctrl.label}: no reading from sensor ${ctrl.pid.inputSensorId}`);
    return null;
  }

  // ── Unit conversion: if sensor displayUnit=F, convert raw °C → °F ──────────
  let currentValue = sensorReading.value;
  const sensorDef = getSensor(ctrl.pid.inputSensorId);
  const needsFConvert =
    sensorDef?.displayUnit === "F" &&
    (sensorDef?.unit === "°C" || sensorDef?.unit === "C");
  if (needsFConvert) {
    currentValue = currentValue * 9 / 5 + 32;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Apply sensor offset (calibration) ──────────────────────────────────────
  // e.g., probe at substrate depth reads 10°F below surface: sensorOffset = 10
  const calibratedValue = currentValue + (ctrl.pid.sensorOffset ?? 0);

  // Use fresh controller reference (may have been recreated above)
  const activeController = pidControllers.get(ctrl.id) ?? controller;
  const output = activeController.update(calibratedValue);
  pidOutputs.set(ctrl.id, output);

  // Store resolved setpoint info for UI
  pidResolvedSetpoints.set(ctrl.id, resolved);

  // For toggle controls: Time-Proportioning (Slow PWM)
  if (ctrl.kind === "toggle") {
    const windowMs = ctrl.pid.pwmWindowMs ?? 10 * 60 * 1000;
    const nowMs = Date.now();
    
    let windowStart = pwmWindowStarts.get(ctrl.id) || nowMs;
    if (nowMs - windowStart >= windowMs) {
      windowStart = nowMs;
      pwmWindowStarts.set(ctrl.id, windowStart);
    } else if (!pwmWindowStarts.has(ctrl.id)) {
      pwmWindowStarts.set(ctrl.id, windowStart);
    }
    
    const clampedOutput = Math.max(0, Math.min(100, output));
    const onTimeMs = (clampedOutput / 100) * windowMs;
    const elapsedInWindow = nowMs - windowStart;
    
    const shouldBeOn = elapsedInWindow < onTimeMs;
    const error = activeSetpoint - calibratedValue;
    
    console.log(`[scheduler] PID ${ctrl.label}: sp=${activeSetpoint.toFixed(1)} (${resolved.mode}/${resolved.phase}) pv=${calibratedValue.toFixed(1)} out=${clampedOutput.toFixed(1)}% → ${shouldBeOn ? "ON" : "OFF"}`);
    return { shouldBeOn, output: clampedOutput };
  }

  // For PWM controls: output percentage directly
  return { shouldBeOn: output > 0, output };
}

/** Get PID output data for all controls (for UI display). */
export function getPidOutputs() {
  const result: Record<string, import("@/lib/types").PIDState> = {};
  const controls = listControls();
  const liveData = getLiveData();

  for (const ctrl of controls) {
    if (ctrl.pid && pidOutputs.has(ctrl.id)) {
      let actual = 0;
      const reading = liveData[ctrl.pid.inputSensorId];
      if (reading && typeof reading.value === "number") {
        actual = reading.value;
        const sensorDef = getSensor(ctrl.pid.inputSensorId);
        const needsFConvert =
          sensorDef?.displayUnit === "F" &&
          (sensorDef?.unit === "°C" || sensorDef?.unit === "C");
        if (needsFConvert) {
          actual = actual * 9 / 5 + 32;
        }
      }

      const resolved = pidResolvedSetpoints.get(ctrl.id);

      const pidInfo: import("@/lib/types").PIDState = {
        label: ctrl.label,
        setpoint: resolved?.setpoint ?? ctrl.pid.setpoint,
        actual,
        output: pidOutputs.get(ctrl.id) || 0,
        Kp: ctrl.pid.Kp,
        Ki: ctrl.pid.Ki,
        Kd: ctrl.pid.Kd,
        error: (resolved?.setpoint ?? ctrl.pid.setpoint) - actual,
        scheduleMode: resolved?.mode,
        schedulePhase: resolved?.phase,
        sensorOffset: ctrl.pid.sensorOffset ?? 0,
      };

      if (ctrl.kind === "toggle") {
        const windowMs = ctrl.pid.pwmWindowMs ?? 10 * 60 * 1000;
        const windowStart = pwmWindowStarts.get(ctrl.id);
        if (windowStart) {
          const now = Date.now();
          const elapsed = now - windowStart;
          const clampedOutput = Math.max(0, Math.min(100, pidInfo.output));
          const onTimeMs = (clampedOutput / 100) * windowMs;
          
          pidInfo.pwmWindowMs = windowMs;
          pidInfo.pwmWindowElapsed = elapsed;
          pidInfo.pwmOnTimeMs = onTimeMs;
          pidInfo.pwmShouldBeOn = elapsed < onTimeMs;
        }
      }
      // Auto-tune status
      pidInfo.autoTuning = autoTuneActive.has(ctrl.id);

      result[ctrl.id] = pidInfo;
    }
  }
  return result;
}

/** Reset PID controller for a control (called when PID config changes). */
export function resetPidController(controlId: string) {
  pidControllers.delete(controlId);
  pidOutputs.delete(controlId);
}

// ─── Auto-Tune (Relay / Ziegler-Nichols) ─────────────────────────────────────

/** Start auto-tuning for a control. */
export function startAutoTune(controlId: string): boolean {
  const controls = listControls();
  const ctrl = controls.find(c => c.id === controlId);
  if (!ctrl?.pid) return false;

  autoTuneActive.set(controlId, {
    controlId,
    setpoint: ctrl.pid.setpoint,
    outputHigh: true,
    peaks: [],
    valleys: [],
    lastCrossing: Date.now(),
    periods: [],
    cycles: 0,
    startedAt: Date.now(),
  });

  console.log(`[scheduler] auto-tune STARTED for ${ctrl.label} (sp=${ctrl.pid.setpoint})`);
  return true;
}

/** Check if auto-tune is running for a control. */
export function isAutoTuning(controlId: string): boolean {
  return autoTuneActive.has(controlId);
}

/** Process one auto-tune tick (relay feedback method). */
function tickAutoTune(ctrl: ControlDef): boolean {
  const state = autoTuneActive.get(ctrl.id);
  if (!state || !ctrl.pid) return false;

  // Read current sensor value
  const liveData = getLiveData();
  const reading = liveData[ctrl.pid.inputSensorId];
  if (!reading || typeof reading.value !== "number") return state.outputHigh;

  // ── Unit conversion: if sensor displayUnit=F, convert raw °C → °F ──────────
  let pv = reading.value;
  const sensorDef = getSensor(ctrl.pid.inputSensorId);
  const needsFConvert =
    sensorDef?.displayUnit === "F" &&
    (sensorDef?.unit === "°C" || sensorDef?.unit === "C");
  if (needsFConvert) {
    pv = pv * 9 / 5 + 32;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const now = Date.now();

  // Relay: toggle output when process variable crosses setpoint
  if (state.outputHigh && pv > state.setpoint) {
    // Crossed above setpoint — switch to OFF, record peak
    state.outputHigh = false;
    state.peaks.push(pv);
    const period = now - state.lastCrossing;
    if (state.lastCrossing > state.startedAt) state.periods.push(period);
    state.lastCrossing = now;
    state.cycles++;
    console.log(`[scheduler] auto-tune ${ctrl.label}: PEAK pv=${pv.toFixed(2)} → OFF (cycle ${state.cycles}, period=${Math.round(period/1000)}s, periods=${state.periods.length})`);
  } else if (!state.outputHigh && pv < state.setpoint) {
    // Crossed below setpoint — switch to ON, record valley
    state.outputHigh = true;
    state.valleys.push(pv);
    const period = now - state.lastCrossing;
    if (state.lastCrossing > state.startedAt) state.periods.push(period);
    state.lastCrossing = now;
    console.log(`[scheduler] auto-tune ${ctrl.label}: VALLEY pv=${pv.toFixed(2)} → ON (periods=${state.periods.length})`);
  }

  // Need at least 3 full cycles for reliable measurement (thermal systems can have 15+ min periods)
  if (state.cycles >= 3 && state.periods.length >= 4) {
    finishAutoTune(ctrl, state);
  }

  // Safety: timeout after 2 hours (slow thermal systems need long oscillation windows)
  if (now - state.startedAt > 120 * 60 * 1000) {
    console.warn(`[scheduler] auto-tune TIMEOUT for ${ctrl.label} after ${Math.round((now - state.startedAt) / 60000)}min (cycles=${state.cycles}, periods=${state.periods.length})`);
    // If we got at least 2 cycles with enough periods, try to finish with what we have
    if (state.cycles >= 2 && state.periods.length >= 3) {
      console.log(`[scheduler] auto-tune: attempting partial finish with ${state.cycles} cycles`);
      finishAutoTune(ctrl, state);
    }
    autoTuneActive.delete(ctrl.id);
  }

  return state.outputHigh;
}

/** Finish auto-tune: compute Ziegler-Nichols gains and save. */
function finishAutoTune(ctrl: ControlDef, state: AutoTuneState) {
  // Calculate ultimate period (average of measured periods, convert to seconds)
  const Pu = (state.periods.reduce((a, b) => a + b, 0) / state.periods.length) / 1000;

  // Calculate process amplitude (average peak-valley difference / 2)
  const avgPeak = state.peaks.reduce((a, b) => a + b, 0) / state.peaks.length;
  const avgValley = state.valleys.reduce((a, b) => a + b, 0) / state.valleys.length;
  const processAmplitude = (avgPeak - avgValley) / 2;

  if (processAmplitude <= 0 || Pu <= 0) {
    console.warn(`[scheduler] auto-tune FAILED for ${ctrl.label}: invalid measurements`);
    autoTuneActive.delete(ctrl.id);
    return;
  }

  // Ultimate gain: Ku = 4d / (π * a) where d = output amplitude (100% for relay), a = process amplitude
  const Ku = (4 * 100) / (Math.PI * processAmplitude);

  // Ziegler-Nichols PID formulas
  const Kp = 0.6 * Ku;
  const Ki = 2 * Kp / Pu;
  const Kd = Kp * Pu / 8;

  // Calculate dynamic PWM window (10% of full oscillation period)
  // Full period = 2 * Pu (since Pu is half-period between crossings). 10% of 2*Pu = Pu * 0.2 sec = Pu * 200 ms.
  // Clamp between 30s and 15min to protect mechanical relays from excessive wear or overly slow response.
  const pwmWindowMs = Math.max(30_000, Math.min(900_000, Math.round(Pu * 200)));

  console.log(`[scheduler] auto-tune COMPLETE for ${ctrl.label}: Pu=${Pu.toFixed(1)}s, Ku=${Ku.toFixed(2)}, Kp=${Kp.toFixed(2)}, Ki=${Ki.toFixed(2)}, Kd=${Kd.toFixed(2)}, pwmWindowMs=${pwmWindowMs}`);

  // Save tuned gains to DB
  if (ctrl.pid) {
    const updatedPid = { ...ctrl.pid, Kp, Ki, Kd, pwmWindowMs, tuned: true };
    const updatedCtrl = { ...ctrl, pid: updatedPid };
    updateControl(ctrl.id, updatedCtrl);

    // Reset the PID controller so it picks up new gains
    resetPidController(ctrl.id);
  }

  autoTuneActive.delete(ctrl.id);
}

/** Evaluate a schedule to determine if the control should be on right now. */
function evaluate(
  schedule: ScheduleDef,
  location: { latitude: number; longitude: number } | null
): boolean | null {
  const now = new Date();

  switch (schedule.type) {
    case "manual":
      return evaluateManual(now, schedule.onTime, schedule.offTime, schedule.timezone);

    case "solar":
      if (!location || (location.latitude === 0 && location.longitude === 0)) return null;
      return evaluateSolar(now, location, schedule.sunriseOffset ?? 0, schedule.sunsetOffset ?? 0);

    case "seasonal":
      return evaluateSeasonal(now, schedule.profiles ?? [], location);

    default:
      return null;
  }
}

/** Manual: compare current time to fixed on/off times. */
function evaluateManual(
  now: Date,
  onTime?: string,
  offTime?: string,
  timezone?: string
): boolean | null {
  if (!onTime || !offTime) return null;

  const tz = timezone ?? "America/Los_Angeles";
  const currentTime = now.toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", timeZone: tz,
  });

  // Handle overnight schedules (e.g., on=22:00, off=06:00)
  if (onTime <= offTime) {
    return currentTime >= onTime && currentTime < offTime;
  } else {
    return currentTime >= onTime || currentTime < offTime;
  }
}

/** Solar: use suncalc to compute today's sunrise/sunset + offsets. */
function evaluateSolar(
  now: Date,
  location: { latitude: number; longitude: number },
  sunriseOffset: number,
  sunsetOffset: number
): boolean {
  const times = SunCalc.getTimes(now, location.latitude, location.longitude);
  const sunrise = new Date(times.sunrise.getTime() + sunriseOffset * 60_000);
  const sunset = new Date(times.sunset.getTime() + sunsetOffset * 60_000);
  return now >= sunrise && now < sunset;
}

/** Seasonal: find the active profile by date, then evaluate it. */
function evaluateSeasonal(
  now: Date,
  profiles: SeasonalProfile[],
  location: { latitude: number; longitude: number } | null
): boolean | null {
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Find the matching profile
  const active = profiles.find((p) => isDateInRange(month, day, p));
  if (!active) return null;

  if (active.type === "solar") {
    if (!location || (location.latitude === 0 && location.longitude === 0)) return null;
    return evaluateSolar(now, location, active.sunriseOffset ?? 0, active.sunsetOffset ?? 0);
  } else {
    return evaluateManual(now, active.onTime, active.offTime);
  }
}

/** Check if a month/day falls within a profile's date range (handles year wrap). */
function isDateInRange(month: number, day: number, profile: SeasonalProfile): boolean {
  const current = month * 100 + day;
  const start = profile.startMonth * 100 + profile.startDay;
  const end = profile.endMonth * 100 + profile.endDay;

  if (start <= end) {
    return current >= start && current <= end;
  } else {
    // Wraps around year end (e.g., Oct 1 – Mar 31)
    return current >= start || current <= end;
  }
}

/** Log a schedule transition as a care event. */
function logScheduleEvent(ctrl: ControlDef, isOn: boolean) {
  try {
    const now = new Date();
    const event: CareEvent = {
      id: `sched-${ctrl.id}-${now.toISOString()}`,
      profileId: "aspen",
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      type: "schedule",
      data: {
        controlId: ctrl.id,
        controlLabel: ctrl.label,
        action: isOn ? "on" : "off",
        trigger: describeSchedule(ctrl.schedule),
      },
      createdAt: now.toISOString(),
    };
    saveCareEvent(event);
  } catch (err) {
    console.error("[scheduler] failed to log event:", err);
  }
}

/** Human-readable description of a schedule config. */
function describeSchedule(schedule?: ScheduleDef): string {
  if (!schedule) return "unknown";
  switch (schedule.type) {
    case "manual":
      return `manual:${schedule.onTime ?? "?"}-${schedule.offTime ?? "?"}`;
    case "solar": {
      const sr = schedule.sunriseOffset ?? 0;
      const ss = schedule.sunsetOffset ?? 0;
      return `solar:sunrise${sr >= 0 ? "+" : ""}${sr}m/sunset${ss >= 0 ? "+" : ""}${ss}m`;
    }
    case "seasonal":
      return `seasonal:${schedule.profiles?.length ?? 0} profiles`;
    default:
      return "unknown";
  }
}

/** Get computed sunrise/sunset for today (for UI display). */
export function getTodaySolarTimes(lat: number, lng: number): { sunrise: string; sunset: string } | null {
  try {
    const times = SunCalc.getTimes(new Date(), lat, lng);
    return {
      sunrise: times.sunrise.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
      sunset: times.sunset.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
    };
  } catch {
    return null;
  }
}

// ─── Dynamic Setpoint Resolution ─────────────────────────────────────────────
// Priority: Brumation > Seasonal > Solar > Daily > Static

/**
 * Resolve the active setpoint for a PID control based on schedule mode and current time.
 * Returns the target setpoint, active mode, descriptive phase label, and sensor offset.
 */
export function resolveActiveSetpoint(
  pid: PidConfig,
  now: Date,
  location: { latitude: number; longitude: number } | null,
): ResolvedSetpoint {
  const offset = pid.sensorOffset ?? 0;

  // ── 1. Brumation Override (highest priority) ───────────────────────────────
  if (pid.brumation?.enabled && pid.brumation.startDate) {
    const brumation = pid.brumation;
    const startDate = new Date(brumation.startDate!);
    const daysSinceStart = (now.getTime() - startDate.getTime()) / 86_400_000;

    if (daysSinceStart >= 0) {
      // Ramp-down phase
      if (daysSinceStart < brumation.rampDownDays) {
        const progress = daysSinceStart / brumation.rampDownDays;
        const tempDelta = pid.setpoint - brumation.targetTempF;
        const ramped = pid.setpoint - (tempDelta * progress);
        return { setpoint: Math.round(ramped * 10) / 10, mode: "brumation", phase: "ramp-down", sensorOffset: offset };
      }

      // If endDate is set, check if we're in ramp-up or past brumation
      if (brumation.endDate) {
        const endDate = new Date(brumation.endDate);
        const daysBeforeEnd = (endDate.getTime() - now.getTime()) / 86_400_000;

        if (daysBeforeEnd <= 0) {
          // Past endDate — brumation complete, fall through to normal scheduling
        } else if (daysBeforeEnd < brumation.rampUpDays) {
          // Ramp-up phase
          const progress = 1 - (daysBeforeEnd / brumation.rampUpDays);
          const tempDelta = pid.setpoint - brumation.targetTempF;
          const ramped = brumation.targetTempF + (tempDelta * progress);
          return { setpoint: Math.round(ramped * 10) / 10, mode: "brumation", phase: "ramp-up", sensorOffset: offset };
        } else {
          // Hold phase
          return { setpoint: brumation.targetTempF, mode: "brumation", phase: "hold", sensorOffset: offset };
        }
      } else {
        // No endDate — indefinite hold
        return { setpoint: brumation.targetTempF, mode: "brumation", phase: "hold", sensorOffset: offset };
      }
    }
  }

  // ── 2. Seasonal Mode ───────────────────────────────────────────────────────
  if (pid.scheduleMode === "seasonal" && pid.seasonalProfiles?.length) {
    const activeSeason = findActiveSeason(pid.seasonalProfiles, now);
    if (activeSeason) {
      // Try solar schedule first, then absolute schedule
      if (activeSeason.solarSchedule?.length && location) {
        const absSchedule = resolveSolarSchedule(activeSeason.solarSchedule, now, location);
        const interp = interpolateSchedule(absSchedule, now);
        return { setpoint: interp.setpoint, mode: "seasonal", phase: `${activeSeason.id}/${interp.phase}`, sensorOffset: offset };
      }
      if (activeSeason.schedule?.length) {
        const interp = interpolateSchedule(activeSeason.schedule, now);
        return { setpoint: interp.setpoint, mode: "seasonal", phase: `${activeSeason.id}/${interp.phase}`, sensorOffset: offset };
      }
    }
    // No matching season — fall through
  }

  // ── 2.5 Natural Cycle Mode ───────────────────────────────────────────────
  if (pid.scheduleMode === "natural" && pid.naturalCycle && location) {
    const habitatLat = (location as { habitatLatitude?: number }).habitatLatitude ?? location.latitude;
    const seasonRanges = getAutoSeasons(habitatLat);
    const activeSeason = findActiveNaturalSeason(seasonRanges, now);
    const seasonConfig = pid.naturalCycle.seasons.find(s => s.id === activeSeason.id);

    if (seasonConfig?.enabled) {
      // Blend temperatures during season transitions
      const blended = blendSeasonTransition(
        pid.naturalCycle.seasons,
        seasonRanges,
        activeSeason,
        pid.naturalCycle.transitionDays ?? 14,
        now,
      );

      // Generate solar-anchored diurnal curve setpoints
      const entries = generateNaturalSetpoints(
        blended.dayPeakF,
        blended.nightLowF,
        seasonConfig.peakOffsetMinutes ?? 60,
        seasonConfig.ramp ?? true,
      );

      // Resolve solar entries to absolute times, then interpolate
      const absSchedule = resolveSolarSchedule(entries, now, location);
      const interp = interpolateSchedule(absSchedule, now);
      return {
        setpoint: interp.setpoint,
        mode: "natural",
        phase: `${activeSeason.id}/${interp.phase}`,
        sensorOffset: offset,
      };
    }
  }

  // ── 3. Solar Mode ──────────────────────────────────────────────────────────
  if (pid.scheduleMode === "solar" && pid.solarSchedule?.length && location) {
    const absSchedule = resolveSolarSchedule(pid.solarSchedule, now, location);
    const interp = interpolateSchedule(absSchedule, now);
    return { setpoint: interp.setpoint, mode: "solar", phase: interp.phase, sensorOffset: offset };
  }

  // ── 4. Daily Mode ──────────────────────────────────────────────────────────
  if (pid.scheduleMode === "daily" && pid.setpointSchedule?.length) {
    const interp = interpolateSchedule(pid.setpointSchedule, now);
    return { setpoint: interp.setpoint, mode: "daily", phase: interp.phase, sensorOffset: offset };
  }

  // ── 5. Static Fallback ─────────────────────────────────────────────────────
  return { setpoint: pid.setpoint, mode: "static", phase: "static", sensorOffset: offset };
}

/** Convert solar-anchored schedule entries to absolute time entries for today. */
function resolveSolarSchedule(
  entries: SolarSetpointEntry[],
  date: Date,
  location: { latitude: number; longitude: number },
): SetpointScheduleEntry[] {
  const times = SunCalc.getTimes(date, location.latitude, location.longitude);
  return entries.map(e => {
    let anchorTime: Date;
    if (e.anchor === "sunrise") anchorTime = times.sunrise;
    else if (e.anchor === "sunset") anchorTime = times.sunset;
    else anchorTime = times.solarNoon;

    const resolved = new Date(anchorTime.getTime() + e.offsetMinutes * 60_000);
    return {
      time: `${String(resolved.getHours()).padStart(2, "0")}:${String(resolved.getMinutes()).padStart(2, "0")}`,
      setpoint: e.setpoint,
      ramp: e.ramp,
      label: e.label,
    };
  }).sort((a, b) => a.time.localeCompare(b.time));
}

/** Interpolate between schedule entries based on current time. */
function interpolateSchedule(
  schedule: SetpointScheduleEntry[],
  now: Date,
): { setpoint: number; phase: string } {
  if (!schedule.length) return { setpoint: 0, phase: "empty" };

  const sorted = [...schedule].sort((a, b) => a.time.localeCompare(b.time));
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Find the two bracketing entries
  let before = sorted[sorted.length - 1]; // wrap around
  let after = sorted[0];
  let foundBracket = false;

  for (let i = 0; i < sorted.length; i++) {
    if (currentTime < sorted[i].time) {
      after = sorted[i];
      before = sorted[i > 0 ? i - 1 : sorted.length - 1];
      foundBracket = true;
      break;
    }
  }

  // If current time is after all entries, we're between last and first (next day)
  if (!foundBracket) {
    before = sorted[sorted.length - 1];
    after = sorted[0];
  }

  // If ramp is disabled on the 'after' entry, use the 'before' setpoint (step)
  if (!after.ramp) {
    return { setpoint: before.setpoint, phase: before.label ?? before.time };
  }

  // Linear interpolation between before and after
  const beforeMins = timeToMinutes(before.time);
  const afterMins = timeToMinutes(after.time);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Handle wrap-around (e.g., 21:00 → 06:00)
  let totalSpan = afterMins - beforeMins;
  let elapsed = nowMins - beforeMins;
  if (totalSpan <= 0) totalSpan += 1440; // 24h
  if (elapsed < 0) elapsed += 1440;

  const t = totalSpan > 0 ? Math.min(1, Math.max(0, elapsed / totalSpan)) : 0;
  const interp = before.setpoint + (after.setpoint - before.setpoint) * t;

  return {
    setpoint: Math.round(interp * 10) / 10,
    phase: before.label ?? before.time,
  };
}

/** Find the active seasonal profile for a given date. */
function findActiveSeason(
  profiles: SeasonalThermalProfile[],
  date: Date,
): SeasonalThermalProfile | null {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  for (const profile of profiles) {
    if (isSeasonDateInRange(month, day, profile.startMonth, profile.startDay, profile.endMonth, profile.endDay)) {
      return profile;
    }
  }
  return null;
}

/** Check if month/day falls within a potentially year-wrapping date range (for seasonal profiles). */
function isSeasonDateInRange(
  month: number, day: number,
  startMonth: number, startDay: number,
  endMonth: number, endDay: number,
): boolean {
  const dateVal = month * 100 + day;
  const startVal = startMonth * 100 + startDay;
  const endVal = endMonth * 100 + endDay;

  if (startVal <= endVal) {
    // Same year range (e.g., Mar 1 → Jun 30)
    return dateVal >= startVal && dateVal <= endVal;
  } else {
    // Wraps around year (e.g., Nov 1 → Feb 28)
    return dateVal >= startVal || dateVal <= endVal;
  }
}

/** Convert "HH:MM" to minutes since midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
