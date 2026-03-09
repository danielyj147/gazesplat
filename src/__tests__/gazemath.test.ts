import { describe, it, expect } from 'vitest';
import {
  cursorToGazeTarget,
  smoothGaze,
  gazeToOffset,
  generateSaccade,
  generateHeadDrift,
  computeBlinkFactor,
  MAX_YAW,
  MAX_PITCH,
} from '../gaze/gazemath';

describe('cursorToGazeTarget', () => {
  it('returns zero gaze for center cursor', () => {
    const gaze = cursorToGazeTarget(500, 400, 1000, 800);
    expect(gaze.yaw).toBeCloseTo(0, 5);
    expect(gaze.pitch).toBeCloseTo(0, 5);
  });

  it('returns positive yaw for cursor to the right', () => {
    const gaze = cursorToGazeTarget(750, 400, 1000, 800);
    expect(gaze.yaw).toBeGreaterThan(0);
    expect(gaze.yaw).toBeLessThanOrEqual(MAX_YAW);
  });

  it('returns negative pitch for cursor below center', () => {
    const gaze = cursorToGazeTarget(500, 600, 1000, 800);
    expect(gaze.pitch).toBeLessThan(0);
    expect(gaze.pitch).toBeGreaterThanOrEqual(-MAX_PITCH);
  });

  it('clamps to maximum angles at viewport edges', () => {
    const gaze = cursorToGazeTarget(1000, 0, 1000, 800);
    expect(Math.abs(gaze.yaw)).toBeLessThanOrEqual(MAX_YAW + 0.001);
    expect(Math.abs(gaze.pitch)).toBeLessThanOrEqual(MAX_PITCH + 0.001);
  });

  it('clamps to maximum angles beyond viewport', () => {
    const gaze = cursorToGazeTarget(2000, -500, 1000, 800);
    expect(Math.abs(gaze.yaw)).toBeLessThanOrEqual(MAX_YAW + 0.001);
    expect(Math.abs(gaze.pitch)).toBeLessThanOrEqual(MAX_PITCH + 0.001);
  });
});

describe('smoothGaze', () => {
  it('moves toward target over time', () => {
    const current = { yaw: 0, pitch: 0 };
    const target = { yaw: 0.5, pitch: 0.3 };
    const result = smoothGaze(current, target, 0.016, 8);

    expect(result.yaw).toBeGreaterThan(0);
    expect(result.yaw).toBeLessThan(0.5);
    expect(result.pitch).toBeGreaterThan(0);
    expect(result.pitch).toBeLessThan(0.3);
  });

  it('converges to target with large dt', () => {
    const current = { yaw: 0, pitch: 0 };
    const target = { yaw: 0.5, pitch: 0.3 };
    const result = smoothGaze(current, target, 10.0, 8);

    expect(result.yaw).toBeCloseTo(0.5, 2);
    expect(result.pitch).toBeCloseTo(0.3, 2);
  });

  it('stays at target when already there', () => {
    const current = { yaw: 0.5, pitch: 0.3 };
    const target = { yaw: 0.5, pitch: 0.3 };
    const result = smoothGaze(current, target, 0.016, 8);

    expect(result.yaw).toBeCloseTo(0.5, 5);
    expect(result.pitch).toBeCloseTo(0.3, 5);
  });
});

describe('gazeToOffset', () => {
  it('returns zero offset for zero gaze', () => {
    const offset = gazeToOffset({ yaw: 0, pitch: 0 }, 0.1);
    expect(offset[0]).toBeCloseTo(0, 5);
    expect(offset[1]).toBeCloseTo(0, 5);
  });

  it('returns positive x for positive yaw', () => {
    const offset = gazeToOffset({ yaw: 0.3, pitch: 0 }, 0.1);
    expect(offset[0]).toBeGreaterThan(0);
  });

  it('scales with eye radius', () => {
    const small = gazeToOffset({ yaw: 0.3, pitch: 0 }, 0.05);
    const large = gazeToOffset({ yaw: 0.3, pitch: 0 }, 0.1);
    expect(Math.abs(large[0])).toBeGreaterThan(Math.abs(small[0]));
  });
});

describe('generateSaccade', () => {
  it('produces small movements', () => {
    const s = generateSaccade(1.0);
    expect(Math.abs(s.yaw)).toBeLessThan(0.05);
    expect(Math.abs(s.pitch)).toBeLessThan(0.05);
  });

  it('varies over time', () => {
    const s1 = generateSaccade(0);
    const s2 = generateSaccade(1);
    const diff = Math.abs(s1.yaw - s2.yaw) + Math.abs(s1.pitch - s2.pitch);
    expect(diff).toBeGreaterThan(0);
  });
});

describe('generateHeadDrift', () => {
  it('produces very small movements (sub-millimeter scale)', () => {
    const d = generateHeadDrift(1.0);
    expect(Math.abs(d.dx)).toBeLessThan(0.002);
    expect(Math.abs(d.dy)).toBeLessThan(0.002);
    expect(Math.abs(d.dz)).toBeLessThan(0.001);
  });

  it('varies over time', () => {
    const d1 = generateHeadDrift(0);
    const d2 = generateHeadDrift(5);
    const diff = Math.abs(d1.dx - d2.dx) + Math.abs(d1.dy - d2.dy);
    expect(diff).toBeGreaterThan(0);
  });

  it('returns zero-ish values at time zero', () => {
    const d = generateHeadDrift(0);
    expect(Math.abs(d.dx)).toBeLessThan(0.001);
    expect(Math.abs(d.dy)).toBeLessThan(0.001);
    expect(Math.abs(d.dz)).toBeLessThan(0.001);
  });
});

describe('computeBlinkFactor', () => {
  it('returns 1.0 most of the time', () => {
    // Sample many times, most should be 1.0
    let openCount = 0;
    for (let t = 0; t < 100; t += 0.1) {
      if (computeBlinkFactor(t) > 0.99) openCount++;
    }
    expect(openCount).toBeGreaterThan(800);
  });

  it('returns values between 0 and 1', () => {
    for (let t = 0; t < 20; t += 0.01) {
      const f = computeBlinkFactor(t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
