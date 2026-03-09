import { clamp, degToRad, smoothDamp } from '../utils/mathUtils';

// Maximum gaze rotation angles (anatomically plausible)
export const MAX_YAW = degToRad(35);    // ±35° horizontal
export const MAX_PITCH = degToRad(25);  // ±25° vertical

export interface GazeAngles {
  yaw: number;   // radians, positive = look right
  pitch: number; // radians, positive = look up
}

export function cursorToGazeTarget(
  cursorX: number,
  cursorY: number,
  canvasWidth: number,
  canvasHeight: number
): GazeAngles {
  // Normalize cursor position to [-1, 1]
  const nx = (cursorX - canvasWidth / 2) / (canvasWidth / 2);
  const ny = -(cursorY - canvasHeight / 2) / (canvasHeight / 2);

  return {
    yaw: clamp(nx * MAX_YAW, -MAX_YAW, MAX_YAW),
    pitch: clamp(ny * MAX_PITCH, -MAX_PITCH, MAX_PITCH),
  };
}

export function smoothGaze(
  current: GazeAngles,
  target: GazeAngles,
  dt: number,
  speed: number
): GazeAngles {
  return {
    yaw: smoothDamp(current.yaw, target.yaw, dt, speed),
    pitch: smoothDamp(current.pitch, target.pitch, dt, speed),
  };
}

export function gazeToOffset(
  gaze: GazeAngles,
  eyeRadius: number
): [number, number, number] {
  // Convert gaze angles to 3D positional offset for iris Gaussians.
  // Multiplier controls how far the iris shifts — needs to be large enough
  // to be clearly visible as a gaze shift.
  const dx = Math.sin(gaze.yaw) * eyeRadius * 1.2;
  const dy = Math.sin(gaze.pitch) * eyeRadius * 1.2;
  const dz = (1 - Math.cos(gaze.yaw)) * eyeRadius * 0.3;
  return [dx, dy, dz];
}

// Micro-saccade simulation for idle animation
export function generateSaccade(time: number): GazeAngles {
  // Small random-ish eye movements using layered sine waves
  const yaw =
    Math.sin(time * 2.3) * 0.008 +
    Math.sin(time * 5.7) * 0.003 +
    Math.sin(time * 0.7) * 0.005;
  const pitch =
    Math.sin(time * 1.9) * 0.006 +
    Math.sin(time * 4.3) * 0.002 +
    Math.sin(time * 0.5) * 0.004;
  return { yaw, pitch };
}

// Subtle head micro-drift for idle animation
// Simulates the slight involuntary head movement all humans have
export function generateHeadDrift(time: number): { dx: number; dy: number; dz: number } {
  const dx =
    Math.sin(time * 0.31) * 0.0008 +
    Math.sin(time * 0.73) * 0.0004 +
    Math.sin(time * 1.17) * 0.0002;
  const dy =
    Math.sin(time * 0.23) * 0.0006 +
    Math.sin(time * 0.67) * 0.0003 +
    Math.sin(time * 0.97) * 0.0002;
  const dz =
    Math.sin(time * 0.19) * 0.0003;
  return { dx, dy, dz };
}

// Blink simulation — uses a stable schedule to avoid random triggering.
// Each blink index maps to a deterministic blink time via a simple hash,
// so the period varies but never causes discontinuous jumps.
export function computeBlinkFactor(time: number): number {
  const BLINK_DURATION = 0.15; // 150ms blink
  const AVG_PERIOD = 4.5;     // average seconds between blinks

  // Determine which blink cycle we're in
  const blinkIndex = Math.floor(time / AVG_PERIOD);

  // Deterministic per-blink offset (varies timing by ±1s)
  const hash = Math.sin(blinkIndex * 127.1) * 43758.5453;
  const offset = (hash - Math.floor(hash) - 0.5) * 2.0; // [-1, 1]

  // Stable blink start time for this cycle
  const blinkStart = blinkIndex * AVG_PERIOD + offset;
  const elapsed = time - blinkStart;

  if (elapsed >= 0 && elapsed < BLINK_DURATION) {
    // Smooth close-then-open with quadratic easing
    const bt = elapsed / BLINK_DURATION;
    return bt < 0.5
      ? 1 - Math.pow(bt * 2, 2)
      : Math.pow((bt - 0.5) * 2, 2);
  }

  return 1.0; // fully open
}
