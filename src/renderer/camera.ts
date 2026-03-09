import { mat4, vec3, clamp, degToRad } from '../utils/mathUtils';

export interface CameraState {
  azimuth: number;   // horizontal rotation in radians
  elevation: number; // vertical rotation in radians
  distance: number;  // distance from target
  target: vec3;      // look-at target
  fovY: number;      // field of view (vertical) in radians
}

export class OrbitCamera {
  state: CameraState;
  viewMatrix: mat4;
  projectionMatrix: mat4;

  private canvas: HTMLCanvasElement;
  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pinchStartDist = 0;
  private pinchStartZoom = 0;

  // Orbit limits
  private minElevation = degToRad(-45);
  private maxElevation = degToRad(45);
  private minAzimuth = degToRad(-50);
  private maxAzimuth = degToRad(50);
  private minDistance = 0.1;
  private maxDistance = 2.0;

  constructor(canvas: HTMLCanvasElement, target: vec3 = [0, 0, -0.5]) {
    this.canvas = canvas;
    this.state = {
      azimuth: 0,
      elevation: 0,
      distance: 1.2,
      target: vec3.clone(target) as vec3,
      fovY: degToRad(45),
    };
    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.updateMatrices();
    this.bindEvents();
  }

  get aspect(): number {
    return this.canvas.width / this.canvas.height;
  }

  get focalLength(): [number, number] {
    const fy = (this.canvas.height / 2) / Math.tan(this.state.fovY / 2);
    const fx = fy; // square pixels
    return [fx, fy];
  }

  updateMatrices(): void {
    const { azimuth, elevation, distance, target, fovY } = this.state;

    const eye: vec3 = [
      target[0] + distance * Math.sin(azimuth) * Math.cos(elevation),
      target[1] + distance * Math.sin(elevation),
      target[2] + distance * Math.cos(azimuth) * Math.cos(elevation),
    ];

    mat4.lookAt(this.viewMatrix, eye, target, [0, 1, 0]);
    mat4.perspective(this.projectionMatrix, fovY, this.aspect, 0.01, 100);
  }

  private bindEvents(): void {
    const c = this.canvas;

    // Mouse
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });

    // Touch (for pinch zoom)
    c.addEventListener('touchstart', this.onTouchStart, { passive: false });
    c.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }

  destroy(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('touchstart', this.onTouchStart);
    c.removeEventListener('touchmove', this.onTouchMove);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };

    const sensitivity = 0.005;
    this.state.azimuth = clamp(
      this.state.azimuth - dx * sensitivity,
      this.minAzimuth,
      this.maxAzimuth
    );
    this.state.elevation = clamp(
      this.state.elevation + dy * sensitivity,
      this.minElevation,
      this.maxElevation
    );
    this.updateMatrices();
  };

  private onPointerUp = (_e: PointerEvent): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    this.state.distance = clamp(
      this.state.distance + e.deltaY * zoomSpeed,
      this.minDistance,
      this.maxDistance
    );
    this.updateMatrices();
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      this.pinchStartZoom = this.state.distance;
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = this.pinchStartDist / dist;
      this.state.distance = clamp(
        this.pinchStartZoom * scale,
        this.minDistance,
        this.maxDistance
      );
      this.updateMatrices();
    }
  };
}
