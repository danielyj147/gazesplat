import type { GaussianCloud, ProcessingStep } from '../types';

function getRange(arr: Float32Array): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  return { min, max };
}
import { detectFace } from './faceDetection';
import { estimateDepth } from './depthEstimation';
import { generateGaussianCloud } from './gaussianGenerator';
import { imageToCanvas, getImageData } from '../utils/imageUtils';

type ProgressCallback = (step: ProcessingStep, progress: number) => void;

export async function processImage(
  image: HTMLImageElement,
  onProgress: ProgressCallback
): Promise<GaussianCloud> {
  // Step 1: Face detection
  onProgress('detecting-face', 0);
  const canvas = imageToCanvas(image, 1024);
  const faceData = await detectFace(canvas);
  onProgress('detecting-face', 100);

  // Step 2: Depth estimation
  onProgress('estimating-depth', 0);
  const depthResult = await estimateDepth(canvas);
  onProgress('estimating-depth', 100);

  // Step 3: Generate Gaussian cloud
  onProgress('generating-gaussians', 0);
  const imageData = getImageData(canvas);
  const cloud = generateGaussianCloud(imageData, depthResult, faceData);
  onProgress('generating-gaussians', 100);

  // Debug: log cloud stats to help diagnose rendering issues
  console.log('[GazeSplat] Gaussian cloud generated:', {
    count: cloud.count,
    posRange: getRange(cloud.positions),
    colorRange: getRange(cloud.colors),
    scaleRange: getRange(cloud.scales),
    opacityRange: getRange(cloud.opacities),
    eyeIndices: {
      leftIris: cloud.eyeIndices.leftIris.length,
      rightIris: cloud.eyeIndices.rightIris.length,
    },
    eyeCenters: cloud.eyeCenters,
  });

  // Step 4: Ready
  onProgress('initializing-renderer', 0);
  await new Promise((r) => setTimeout(r, 100));
  onProgress('initializing-renderer', 100);

  return cloud;
}
