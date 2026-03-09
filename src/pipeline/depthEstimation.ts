import { pipeline, env } from '@huggingface/transformers';

// Configure Transformers.js to use CDN for WASM backends
env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let depthPipeline: any = null;

async function getDepthPipeline() {
  if (depthPipeline) return depthPipeline;
  depthPipeline = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
    device: 'webgpu' in navigator ? 'webgpu' : 'wasm',
    dtype: 'fp32',
  });
  return depthPipeline;
}

export interface DepthResult {
  depthMap: Float32Array;
  width: number;
  height: number;
}

export async function estimateDepth(
  imageSource: string | HTMLCanvasElement
): Promise<DepthResult> {
  const pipe = await getDepthPipeline();

  let input: string;
  if (imageSource instanceof HTMLCanvasElement) {
    input = imageSource.toDataURL('image/png');
  } else {
    input = imageSource;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await pipe(input) as any;
  const depthImage = result.depth;
  const width = depthImage.width;
  const height = depthImage.height;

  // Extract depth values from the RawImage
  const rawData = depthImage.data;
  const channels = depthImage.channels ?? 1;

  console.log('[DepthEstimation] RawImage info:', {
    width, height, channels,
    dataType: rawData.constructor.name,
    dataLength: rawData.length,
    sampleValues: [rawData[0], rawData[1], rawData[2], rawData[Math.floor(rawData.length / 2)]],
  });

  const depthMap = new Float32Array(width * height);

  // Find actual min/max for normalization
  let minDepth = Infinity, maxDepth = -Infinity;
  for (let i = 0; i < width * height; i++) {
    const val = rawData[i * channels];
    if (val < minDepth) minDepth = val;
    if (val > maxDepth) maxDepth = val;
  }
  const depthRange = maxDepth - minDepth || 1;

  console.log('[DepthEstimation] Depth range:', { minDepth, maxDepth, depthRange });

  // Depth Anything V2 outputs disparity: higher value = closer to camera.
  // This is true for both uint8 (bright = close) and float formats.
  // Normalize to [0, 1] where 1 = closest.
  for (let i = 0; i < width * height; i++) {
    depthMap[i] = (rawData[i * channels] - minDepth) / depthRange;
  }

  console.log('[DepthEstimation] dataType:', rawData.constructor.name, 'depthMap sample center:', depthMap[Math.floor(width * height / 2)].toFixed(3));

  return { depthMap, width, height };
}
