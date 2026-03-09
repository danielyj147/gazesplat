import { mat4, vec3, vec4, quat } from 'gl-matrix';

export { mat4, vec3, vec4, quat };

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothDamp(
  current: number,
  target: number,
  dt: number,
  speed: number
): number {
  const t = 1 - Math.exp(-dt * speed);
  return lerp(current, target, t);
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function createPerspectiveMatrix(
  fovY: number,
  aspect: number,
  near: number,
  far: number
): mat4 {
  const out = mat4.create();
  mat4.perspective(out, fovY, aspect, near, far);
  return out;
}

export function createLookAtMatrix(
  eye: vec3,
  center: vec3,
  up: vec3
): mat4 {
  const out = mat4.create();
  mat4.lookAt(out, eye, center, up);
  return out;
}
