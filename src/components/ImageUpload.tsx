import { useCallback, useRef, useState } from 'react';

interface ImageUploadProps {
  onImageSelected: (file: File) => void;
}

export function ImageUpload({ onImageSelected }: ImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file (JPEG or PNG).');
        return;
      }
      onImageSelected(file);
    },
    [onImageSelected]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          return;
        }
      }
    },
    [handleFile]
  );

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1024 }, height: { ideal: 1024 } },
      });
      streamRef.current = stream;
      setShowCamera(true);
      // Wait for video element to mount
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      });
    } catch {
      alert('Could not access camera. Please upload a photo instead.');
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    // Mirror the image (selfie mode)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    // Stop camera
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        handleFile(file);
      }
    }, 'image/jpeg', 0.92);
  }, [handleFile]);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  }, []);

  if (showCamera) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="max-w-lg w-full">
          <div className="relative rounded-2xl overflow-hidden bg-black mb-6">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-square object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={closeCamera}
              className="px-5 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={capturePhoto}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              Capture
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-8"
      onPaste={onPaste}
    >
      <div className="max-w-lg w-full text-center mb-12">
        <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">
          GazeSplat
        </h1>
        <p className="text-lg text-gray-400">
          Upload a selfie to create an interactive 3D portrait
        </p>
      </div>

      <div
        className={`
          relative w-full max-w-md aspect-square rounded-2xl border-2 border-dashed
          transition-all duration-200 cursor-pointer
          flex flex-col items-center justify-center gap-4
          ${
            isDragOver
              ? 'border-blue-400 bg-blue-500/10 scale-[1.02]'
              : 'border-gray-600 bg-gray-800/50 hover:border-gray-400 hover:bg-gray-800/80'
          }
        `}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload a selfie image"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
      >
        <svg
          className={`w-16 h-16 ${isDragOver ? 'text-blue-400' : 'text-gray-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16v-8m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.345A4.5 4.5 0 0117.25 19.5H6.75z"
          />
        </svg>

        <div className="text-center">
          <p className="text-white font-medium text-lg">
            Drop your selfie here
          </p>
          <p className="text-gray-400 text-sm mt-1">
            or click to browse
          </p>
        </div>

        <p className="text-gray-500 text-xs mt-2">
          JPEG or PNG, front-facing photo works best
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      <div className="flex items-center gap-4 mt-6">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openCamera();
          }}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
          Take a selfie
        </button>
        <span className="text-gray-600 text-xs">
          or paste from clipboard (Ctrl+V)
        </span>
      </div>

      <div className="mt-12 max-w-sm w-full text-center">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">
          Example output
        </p>
        <img
          src="/sample-preview.png"
          alt="Example 3D Gaussian splat portrait"
          className="w-full rounded-xl border border-gray-700/50 shadow-lg"
        />
      </div>
    </div>
  );
}
