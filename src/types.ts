export interface GaussianCloud {
  count: number;
  positions: Float32Array;   // [x, y, z] * count
  colors: Float32Array;      // [r, g, b] * count
  scales: Float32Array;      // [sx, sy, sz] * count
  opacities: Float32Array;   // [opacity] * count
  rotations: Float32Array;   // [qw, qx, qy, qz] * count

  // Eye region metadata for gaze tracking
  eyeIndices: {
    leftIris: number[];
    rightIris: number[];
    leftEye: number[];
    rightEye: number[];
    leftUpperLid: number[];
    rightUpperLid: number[];
  };
  eyeCenters: {
    left: [number, number, number];
    right: [number, number, number];
  };
}

export interface FaceData {
  landmarks: NormalizedLandmark[];
  boundingBox: { x: number; y: number; width: number; height: number };
  irisLeft: NormalizedLandmark[];
  irisRight: NormalizedLandmark[];
  imageWidth: number;
  imageHeight: number;
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export type AppState =
  | { stage: 'upload' }
  | { stage: 'processing'; step: ProcessingStep; progress: number }
  | { stage: 'viewing'; cloud: GaussianCloud }
  | { stage: 'error'; message: string; canRetry: boolean };

export type ProcessingStep =
  | 'detecting-face'
  | 'estimating-depth'
  | 'generating-gaussians'
  | 'initializing-renderer';

export const STEP_LABELS: Record<ProcessingStep, string> = {
  'detecting-face': 'Detecting face...',
  'estimating-depth': 'Estimating depth...',
  'generating-gaussians': 'Generating 3D Gaussians...',
  'initializing-renderer': 'Initializing renderer...',
};
