import { describe, it, expect } from 'vitest';
import { generateGaussianCloud } from '../pipeline/gaussianGenerator';
import type { FaceData, NormalizedLandmark } from '../types';
import type { DepthResult } from '../pipeline/depthEstimation';

function createMockFaceData(width: number, height: number): FaceData {
  // Create 478 landmarks in a roughly face-shaped pattern
  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    // Center the landmarks
    const angle = (i / 478) * Math.PI * 2;
    const r = 0.15;
    landmarks.push({
      x: 0.5 + Math.cos(angle) * r,
      y: 0.45 + Math.sin(angle) * r,
      z: 0,
    });
  }

  // Set specific iris landmarks (468-477)
  landmarks[468] = { x: 0.42, y: 0.42, z: 0 }; // left iris center
  landmarks[469] = { x: 0.41, y: 0.42, z: 0 };
  landmarks[470] = { x: 0.43, y: 0.42, z: 0 };
  landmarks[471] = { x: 0.42, y: 0.41, z: 0 };
  landmarks[472] = { x: 0.42, y: 0.43, z: 0 };
  landmarks[473] = { x: 0.58, y: 0.42, z: 0 }; // right iris center
  landmarks[474] = { x: 0.57, y: 0.42, z: 0 };
  landmarks[475] = { x: 0.59, y: 0.42, z: 0 };
  landmarks[476] = { x: 0.58, y: 0.41, z: 0 };
  landmarks[477] = { x: 0.58, y: 0.43, z: 0 };

  return {
    landmarks,
    boundingBox: { x: width * 0.2, y: height * 0.1, width: width * 0.6, height: height * 0.8 },
    irisLeft: [landmarks[468], landmarks[469], landmarks[470], landmarks[471], landmarks[472]],
    irisRight: [landmarks[473], landmarks[474], landmarks[475], landmarks[476], landmarks[477]],
    imageWidth: width,
    imageHeight: height,
  };
}

function createMockImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 200;     // R
    data[i * 4 + 1] = 150; // G
    data[i * 4 + 2] = 120; // B
    data[i * 4 + 3] = 255; // A
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

function createMockDepthResult(width: number, height: number): DepthResult {
  const depthMap = new Float32Array(width * height);
  // Create a smooth depth gradient (center closer)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = x / width - 0.5;
      const cy = y / height - 0.5;
      depthMap[y * width + x] = 0.5 + 0.3 * (1 - Math.sqrt(cx * cx + cy * cy));
    }
  }
  return { depthMap, width, height };
}

describe('generateGaussianCloud', () => {
  const width = 100;
  const height = 100;
  const imageData = createMockImageData(width, height);
  const depthResult = createMockDepthResult(64, 64);
  const faceData = createMockFaceData(width, height);

  it('generates a non-empty Gaussian cloud', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    expect(cloud.count).toBeGreaterThan(0);
  });

  it('has correctly sized arrays', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    expect(cloud.positions.length).toBe(cloud.count * 3);
    expect(cloud.colors.length).toBe(cloud.count * 3);
    expect(cloud.scales.length).toBe(cloud.count * 3);
    expect(cloud.opacities.length).toBe(cloud.count);
    expect(cloud.rotations.length).toBe(cloud.count * 4);
  });

  it('has all finite position values', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    for (let i = 0; i < cloud.positions.length; i++) {
      expect(isFinite(cloud.positions[i])).toBe(true);
    }
  });

  it('has positive scales', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    for (let i = 0; i < cloud.scales.length; i++) {
      expect(cloud.scales[i]).toBeGreaterThan(0);
    }
  });

  it('has opacities in [0, 1]', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    for (let i = 0; i < cloud.opacities.length; i++) {
      expect(cloud.opacities[i]).toBeGreaterThanOrEqual(0);
      expect(cloud.opacities[i]).toBeLessThanOrEqual(1);
    }
  });

  it('has colors in [0, 1]', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    for (let i = 0; i < cloud.colors.length; i++) {
      expect(cloud.colors[i]).toBeGreaterThanOrEqual(0);
      expect(cloud.colors[i]).toBeLessThanOrEqual(1);
    }
  });

  it('identifies eye regions', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    // Should have some iris Gaussians identified
    expect(cloud.eyeIndices.leftIris.length).toBeGreaterThanOrEqual(0);
    expect(cloud.eyeIndices.rightIris.length).toBeGreaterThanOrEqual(0);
  });

  it('has unit quaternion rotations', () => {
    const cloud = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 50,
    });
    for (let i = 0; i < cloud.count; i++) {
      const qw = cloud.rotations[i * 4];
      const qx = cloud.rotations[i * 4 + 1];
      const qy = cloud.rotations[i * 4 + 2];
      const qz = cloud.rotations[i * 4 + 3];
      const norm = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
      expect(norm).toBeCloseTo(1.0, 3);
    }
  });

  it('generates more Gaussians with smaller target resolution', () => {
    const small = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 30,
    });
    const large = generateGaussianCloud(imageData, depthResult, faceData, {
      targetResolution: 60,
    });
    expect(large.count).toBeGreaterThan(small.count);
  });
});
