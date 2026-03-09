export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image from ${url}`));
    img.src = url;
  });
}

export function imageToCanvas(
  img: HTMLImageElement,
  maxSize: number = 1024
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let { width, height } = img;

  if (width > maxSize || height > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export function getImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function computeGradientMagnitude(
  gray: Float32Array,
  width: number,
  height: number
): Float32Array {
  const gradient = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        gray[idx + 1] - gray[idx - 1] +
        2 * (gray[idx + width + 1] - gray[idx + width - 1]) +
        gray[idx - width + 1] - gray[idx - width - 1];
      const gy =
        gray[idx + width] - gray[idx - width] +
        2 * (gray[idx + width + 1] - gray[idx - width + 1]) +
        gray[idx + width - 1] - gray[idx - width - 1];
      gradient[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return gradient;
}
