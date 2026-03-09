import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FaceData, NormalizedLandmark } from '../types';

let faceLandmarker: FaceLandmarker | null = null;

async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;

  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numFaces: 2,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  return faceLandmarker;
}

// MediaPipe iris landmark indices
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

export async function detectFace(
  image: HTMLImageElement | HTMLCanvasElement
): Promise<FaceData> {
  const landmarker = await getFaceLandmarker();
  const result = landmarker.detect(image);

  if (result.faceLandmarks.length === 0) {
    throw new Error(
      'No face detected. Please upload a clear, front-facing photo with good lighting.'
    );
  }

  if (result.faceLandmarks.length > 1) {
    throw new Error(
      'Multiple faces detected. Please upload a photo with exactly one face.'
    );
  }

  const landmarks = result.faceLandmarks[0] as NormalizedLandmark[];
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  // Compute bounding box from landmarks
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const lm of landmarks) {
    minX = Math.min(minX, lm.x);
    minY = Math.min(minY, lm.y);
    maxX = Math.max(maxX, lm.x);
    maxY = Math.max(maxY, lm.y);
  }

  // Add padding
  const padX = (maxX - minX) * 0.2;
  const padY = (maxY - minY) * 0.3;
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(1, maxX + padX);
  maxY = Math.min(1, maxY + padY * 0.5);

  return {
    landmarks,
    boundingBox: {
      x: minX * width,
      y: minY * height,
      width: (maxX - minX) * width,
      height: (maxY - minY) * height,
    },
    irisLeft: LEFT_IRIS.map((i) => landmarks[i]),
    irisRight: RIGHT_IRIS.map((i) => landmarks[i]),
    imageWidth: width,
    imageHeight: height,
  };
}
