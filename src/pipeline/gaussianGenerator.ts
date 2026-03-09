import type { FaceData, GaussianCloud, NormalizedLandmark } from '../types';
import type { DepthResult } from './depthEstimation';
import { computeGradientMagnitude } from '../utils/imageUtils';

// MediaPipe landmark indices for eye regions
const LEFT_EYE_CONTOUR = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];
const RIGHT_EYE_CONTOUR = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
];
// Upper eyelid landmarks (for blink simulation)
const LEFT_UPPER_LID = [159, 160, 161, 158, 157, 173];
const RIGHT_UPPER_LID = [386, 387, 388, 385, 384, 398];

interface GeneratorConfig {
  targetResolution: number;
  depthDisplacement: number; // max Z displacement from depth (as fraction of face width)
  baseGaussianScale: number;
  faceOpacity: number;
  backgroundOpacity: number;
  adaptiveDensityThreshold: number;
}

const DEFAULT_CONFIG: GeneratorConfig = {
  targetResolution: 512,
  depthDisplacement: 0.55,   // 55% of face width — pronounced facial feature relief
  baseGaussianScale: 0.004,
  faceOpacity: 0.95,
  backgroundOpacity: 0.5,
  adaptiveDensityThreshold: 0.10,
};

export function generateGaussianCloud(
  imageData: ImageData,
  depthResult: DepthResult,
  faceData: FaceData,
  config: Partial<GeneratorConfig> = {}
): GaussianCloud {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { width: imgW, height: imgH } = imageData;
  const { depthMap, width: depthW, height: depthH } = depthResult;

  // Compute face size from landmarks for scale reference
  const leftIrisCenter = averageLandmark(faceData.irisLeft);
  const rightIrisCenter = averageLandmark(faceData.irisRight);
  const faceCenter = {
    x: (leftIrisCenter.x + rightIrisCenter.x) / 2,
    y: (leftIrisCenter.y + rightIrisCenter.y) / 2,
  };

  // Compute the target grid resolution
  const scale = cfg.targetResolution / Math.max(imgW, imgH);
  const gridW = Math.round(imgW * scale);
  const gridH = Math.round(imgH * scale);

  // Compute face mask from landmarks
  const faceMask = createFaceMask(faceData.landmarks, gridW, gridH);

  // Compute gradient for adaptive density
  const grayScale = new Float32Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const srcX = Math.floor((x / gridW) * imgW);
      const srcY = Math.floor((y / gridH) * imgH);
      const idx = (srcY * imgW + srcX) * 4;
      grayScale[y * gridW + x] =
        (imageData.data[idx] * 0.299 +
          imageData.data[idx + 1] * 0.587 +
          imageData.data[idx + 2] * 0.114) / 255;
    }
  }
  const gradient = computeGradientMagnitude(grayScale, gridW, gridH);

  // First pass: count Gaussians
  let totalCount = 0;
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const gi = y * gridW + x;
      totalCount += gradient[gi] > cfg.adaptiveDensityThreshold ? 4 : 1;
    }
  }

  // Allocate arrays
  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const scales = new Float32Array(totalCount * 3);
  const opacities = new Float32Array(totalCount);
  const rotations = new Float32Array(totalCount * 4);

  // Eye region tracking
  const leftIrisGaussians: number[] = [];
  const rightIrisGaussians: number[] = [];
  const leftEyeGaussians: number[] = [];
  const rightEyeGaussians: number[] = [];
  const leftUpperLidGaussians: number[] = [];
  const rightUpperLidGaussians: number[] = [];

  // Precompute eye regions in grid space
  const pixelIPD = Math.sqrt(
    Math.pow((rightIrisCenter.x - leftIrisCenter.x) * gridW, 2) +
    Math.pow((rightIrisCenter.y - leftIrisCenter.y) * gridH, 2)
  );
  const leftIrisCenterGrid = {
    x: leftIrisCenter.x * gridW,
    y: leftIrisCenter.y * gridH,
  };
  const rightIrisCenterGrid = {
    x: rightIrisCenter.x * gridW,
    y: rightIrisCenter.y * gridH,
  };
  const irisRadius = pixelIPD * 0.15;
  const eyeRadius = pixelIPD * 0.35;

  const leftEyeCenterGrid = averageLandmarkGrid(
    LEFT_EYE_CONTOUR.map((i) => faceData.landmarks[i]), gridW, gridH
  );
  const rightEyeCenterGrid = averageLandmarkGrid(
    RIGHT_EYE_CONTOUR.map((i) => faceData.landmarks[i]), gridW, gridH
  );
  const leftUpperLidGrid = averageLandmarkGrid(
    LEFT_UPPER_LID.map((i) => faceData.landmarks[i]), gridW, gridH
  );
  const rightUpperLidGrid = averageLandmarkGrid(
    RIGHT_UPPER_LID.map((i) => faceData.landmarks[i]), gridW, gridH
  );
  const lidRadius = pixelIPD * 0.18;

  // Depth-driven approach: XY from pixel coords, Z purely from the depth map.
  const planeWidth = 1.0;
  const planeHeight = planeWidth * (gridH / gridW);
  const maxZDisplacement = planeWidth * cfg.depthDisplacement;
  const baseZ = -0.5;

  let gaussianIdx = 0;

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const gi = y * gridW + x;
      const isHighFreq = gradient[gi] > cfg.adaptiveDensityThreshold;
      const subDivs = isHighFreq ? 2 : 1;

      for (let sy = 0; sy < subDivs; sy++) {
        for (let sx = 0; sx < subDivs; sx++) {
          const px = x + (subDivs > 1 ? (sx + 0.25) / subDivs : 0.5);
          const py = y + (subDivs > 1 ? (sy + 0.25) / subDivs : 0.5);

          // Normalized image coordinates [0,1]
          const u = px / gridW;
          const v = py / gridH;

          // XY: plane centered at face center
          const X = (u - faceCenter.x) * planeWidth;
          const Y = -(v - faceCenter.y) * planeHeight; // flip Y for GL

          // Sample depth → Z displacement (depth map drives all geometry)
          const depthX = Math.min(Math.floor(u * depthW), depthW - 1);
          const depthY = Math.min(Math.floor(v * depthH), depthH - 1);
          const depthVal = depthMap[depthY * depthW + depthX]; // 0=far, 1=close

          // Z: purely depth-driven. The depth map has the real facial contours —
          // nose protrudes, eye sockets recede, cheekbones come forward, etc.
          const Z = baseZ + depthVal * maxZDisplacement;

          positions[gaussianIdx * 3] = X;
          positions[gaussianIdx * 3 + 1] = Y;
          positions[gaussianIdx * 3 + 2] = Z;

          // Sample color from source image
          const srcX = Math.min(Math.floor(u * imgW), imgW - 1);
          const srcY = Math.min(Math.floor(v * imgH), imgH - 1);
          const pixIdx = (srcY * imgW + srcX) * 4;
          colors[gaussianIdx * 3] = imageData.data[pixIdx] / 255;
          colors[gaussianIdx * 3 + 1] = imageData.data[pixIdx + 1] / 255;
          colors[gaussianIdx * 3 + 2] = imageData.data[pixIdx + 2] / 255;

          // Scale: uniform XY based on pixel spacing, thicker Z for volume
          const pixelSize = planeWidth / gridW;
          const s = (pixelSize / subDivs) * 1.2; // slight overlap to avoid gaps
          scales[gaussianIdx * 3] = s;
          scales[gaussianIdx * 3 + 1] = s;
          // Z thickness: thicker in face region for solid volume, thinner at edges
          const isFaceRegion = faceMask[gi] > 0.5;
          scales[gaussianIdx * 3 + 2] = isFaceRegion ? s * 1.5 : s * 0.4;

          // Opacity: higher for face, lower for background
          const isFace = faceMask[gi] > 0.5;
          opacities[gaussianIdx] = isFace ? cfg.faceOpacity : cfg.backgroundOpacity;

          // Identity rotation
          rotations[gaussianIdx * 4] = 1;
          rotations[gaussianIdx * 4 + 1] = 0;
          rotations[gaussianIdx * 4 + 2] = 0;
          rotations[gaussianIdx * 4 + 3] = 0;

          // Tag eye/iris Gaussians
          const dxL = px - leftIrisCenterGrid.x;
          const dyL = py - leftIrisCenterGrid.y;
          const dxR = px - rightIrisCenterGrid.x;
          const dyR = py - rightIrisCenterGrid.y;

          if (dxL * dxL + dyL * dyL < irisRadius * irisRadius) {
            leftIrisGaussians.push(gaussianIdx);
          } else {
            const dxLE = px - leftEyeCenterGrid.x;
            const dyLE = py - leftEyeCenterGrid.y;
            if (dxLE * dxLE + dyLE * dyLE < eyeRadius * eyeRadius) {
              leftEyeGaussians.push(gaussianIdx);
            }
          }

          if (dxR * dxR + dyR * dyR < irisRadius * irisRadius) {
            rightIrisGaussians.push(gaussianIdx);
          } else {
            const dxRE = px - rightEyeCenterGrid.x;
            const dyRE = py - rightEyeCenterGrid.y;
            if (dxRE * dxRE + dyRE * dyRE < eyeRadius * eyeRadius) {
              rightEyeGaussians.push(gaussianIdx);
            }
          }

          // Tag upper eyelid Gaussians for blink simulation
          const dxLL = px - leftUpperLidGrid.x;
          const dyLL = py - leftUpperLidGrid.y;
          if (dxLL * dxLL + dyLL * dyLL < lidRadius * lidRadius && py < leftIrisCenterGrid.y) {
            leftUpperLidGaussians.push(gaussianIdx);
          }
          const dxRL = px - rightUpperLidGrid.x;
          const dyRL = py - rightUpperLidGrid.y;
          if (dxRL * dxRL + dyRL * dyRL < lidRadius * lidRadius && py < rightIrisCenterGrid.y) {
            rightUpperLidGaussians.push(gaussianIdx);
          }

          gaussianIdx++;
        }
      }
    }
  }

  // Compute eye centers in 3D
  const leftEyeCenter3D = computeCenter3D(positions, leftIrisGaussians);
  const rightEyeCenter3D = computeCenter3D(positions, rightIrisGaussians);

  console.log('[GaussianGenerator] Cloud stats:', {
    count: totalCount,
    gridSize: `${gridW}x${gridH}`,
    planeSize: `${planeWidth.toFixed(3)}x${planeHeight.toFixed(3)}`,
    maxZDisplacement: maxZDisplacement.toFixed(4),
    baseZ,
    irisFound: { left: leftIrisGaussians.length, right: rightIrisGaussians.length },
  });

  return {
    count: totalCount,
    positions,
    colors,
    scales,
    opacities,
    rotations,
    eyeIndices: {
      leftIris: leftIrisGaussians,
      rightIris: rightIrisGaussians,
      leftEye: leftEyeGaussians,
      rightEye: rightEyeGaussians,
      leftUpperLid: leftUpperLidGaussians,
      rightUpperLid: rightUpperLidGaussians,
    },
    eyeCenters: {
      left: leftEyeCenter3D,
      right: rightEyeCenter3D,
    },
  };
}

function averageLandmark(landmarks: NormalizedLandmark[]): NormalizedLandmark {
  const avg = { x: 0, y: 0, z: 0 };
  for (const lm of landmarks) {
    avg.x += lm.x;
    avg.y += lm.y;
    avg.z += lm.z;
  }
  avg.x /= landmarks.length;
  avg.y /= landmarks.length;
  avg.z /= landmarks.length;
  return avg;
}

function averageLandmarkGrid(
  landmarks: NormalizedLandmark[],
  gridW: number,
  gridH: number
): { x: number; y: number } {
  const avg = averageLandmark(landmarks);
  return { x: avg.x * gridW, y: avg.y * gridH };
}

function createFaceMask(
  landmarks: NormalizedLandmark[],
  gridW: number,
  gridH: number
): Float32Array {
  const mask = new Float32Array(gridW * gridH);

  const faceOvalIndices = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
  ];

  const polygon = faceOvalIndices.map((i) => ({
    x: landmarks[i].x * gridW,
    y: landmarks[i].y * gridH,
  }));

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      mask[y * gridW + x] = pointInPolygon(x, y, polygon) ? 1.0 : 0.0;
    }
  }

  return mask;
}

function pointInPolygon(
  x: number,
  y: number,
  polygon: { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function computeCenter3D(
  positions: Float32Array,
  indices: number[]
): [number, number, number] {
  if (indices.length === 0) return [0, 0, -0.5];
  let x = 0, y = 0, z = 0;
  for (const i of indices) {
    x += positions[i * 3];
    y += positions[i * 3 + 1];
    z += positions[i * 3 + 2];
  }
  const n = indices.length;
  return [x / n, y / n, z / n];
}
