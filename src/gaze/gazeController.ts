import type { GaussianCloud } from '../types';
import type { SplatRenderer } from '../renderer/SplatRenderer';
import {
  type GazeAngles,
  cursorToGazeTarget,
  smoothGaze,
  gazeToOffset,
  generateSaccade,
  generateHeadDrift,
} from './gazemath';

export class GazeController {
  private renderer: SplatRenderer;
  private canvas: HTMLCanvasElement;

  private currentGaze: GazeAngles = { yaw: 0, pitch: 0 };
  private targetGaze: GazeAngles = { yaw: 0, pitch: 0 };
  private isTracking = false;
  private _gazeEnabled = true;
  private startTime = performance.now() / 1000;

  // Smoothing speeds
  private trackingSpeed = 8.0;  // fast follow
  private returnSpeed = 3.0;    // slow ease-out

  // Eye radius estimated from Gaussian cloud
  private eyeRadius: number;

  constructor(
    renderer: SplatRenderer,
    cloud: GaussianCloud,
    canvas: HTMLCanvasElement,
  ) {
    this.renderer = renderer;
    this.canvas = canvas;

    // Estimate eye radius from distance between iris centers.
    // In the billboard coordinate system the inter-eye distance is ~0.1-0.2 units.
    // A real iris is roughly 1/6 of the inter-pupillary distance.
    const lc = cloud.eyeCenters.left;
    const rc = cloud.eyeCenters.right;
    const ipd = Math.sqrt(
      (rc[0] - lc[0]) ** 2 + (rc[1] - lc[1]) ** 2 + (rc[2] - lc[2]) ** 2
    );
    this.eyeRadius = ipd * 0.15;

    if (this.eyeRadius < 0.005) this.eyeRadius = 0.015;

    console.log('[GazeController] IPD:', ipd.toFixed(4), 'eyeRadius:', this.eyeRadius.toFixed(4));

    this.bindEvents();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    this.canvas.addEventListener('mouseenter', this.onMouseEnter);
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: true });
    this.canvas.addEventListener('touchend', this.onTouchEnd);
  }

  private onMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.targetGaze = cursorToGazeTarget(x, y, rect.width, rect.height);
    this.isTracking = true;
  };

  private onMouseLeave = (): void => {
    this.isTracking = false;
    this.targetGaze = { yaw: 0, pitch: 0 };
  };

  private onMouseEnter = (): void => {
    this.isTracking = true;
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      this.targetGaze = cursorToGazeTarget(x, y, rect.width, rect.height);
      this.isTracking = true;
    }
  };

  private onTouchEnd = (): void => {
    this.isTracking = false;
    this.targetGaze = { yaw: 0, pitch: 0 };
  };

  get gazeEnabled(): boolean {
    return this._gazeEnabled;
  }

  set gazeEnabled(enabled: boolean) {
    this._gazeEnabled = enabled;
    if (!enabled) {
      this.targetGaze = { yaw: 0, pitch: 0 };
      this.isTracking = false;
    }
  }

  update(dt: number): void {
    const tracking = this._gazeEnabled && this.isTracking;
    const speed = tracking ? this.trackingSpeed : this.returnSpeed;

    // Add micro-saccades when not actively tracking
    const time = performance.now() / 1000 - this.startTime;
    let target = this._gazeEnabled ? this.targetGaze : { yaw: 0, pitch: 0 };
    if (!tracking) {
      const saccade = generateSaccade(time);
      target = {
        yaw: target.yaw + saccade.yaw,
        pitch: target.pitch + saccade.pitch,
      };
    }

    this.currentGaze = smoothGaze(this.currentGaze, target, dt, speed);

    // Compute subtle head micro-drift (idle animation)
    const headDrift = generateHeadDrift(time);

    // Convert gaze angles to 3D offsets
    const leftOffset = gazeToOffset(this.currentGaze, this.eyeRadius);
    const rightOffset = gazeToOffset(this.currentGaze, this.eyeRadius);

    this.renderer.applyGazeOffset(leftOffset, rightOffset, 1.0, headDrift);
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('mouseenter', this.onMouseEnter);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
  }
}
