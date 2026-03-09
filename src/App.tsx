import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppState, ProcessingStep } from './types';
import { ImageUpload } from './components/ImageUpload';
import { ProcessingView } from './components/ProcessingView';
import { ViewerCanvas } from './components/ViewerCanvas';
import { ErrorView } from './components/ErrorView';
import { processImage } from './pipeline/processingPipeline';
import { loadImage, loadImageFromUrl } from './utils/imageUtils';

const SAMPLE_IMAGE_URL = '/sample.jpg';

export default function App() {
  const [state, setState] = useState<AppState>({ stage: 'upload' });
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [fadeIn, setFadeIn] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const abortRef = useRef(false);
  const demoAttempted = useRef(false);

  // Trigger fade-in on mount and state changes
  useEffect(() => {
    setFadeIn(false);
    const raf = requestAnimationFrame(() => setFadeIn(true));
    return () => cancelAnimationFrame(raf);
  }, [state.stage]);

  // On mount, try to load the default sample image
  useEffect(() => {
    if (demoAttempted.current) return;
    demoAttempted.current = true;

    (async () => {
      try {
        const img = await loadImageFromUrl(SAMPLE_IMAGE_URL);
        // Sample image exists — process it as the demo
        setIsDemo(true);
        setState({ stage: 'processing', step: 'detecting-face', progress: 0 });

        const cloud = await processImage(img, (step: ProcessingStep, progress: number) => {
          setState({ stage: 'processing', step, progress });
        });

        setState({ stage: 'viewing', cloud });
      } catch {
        // No sample image — just show the upload screen
      }
    })();
  }, []);

  const processFile = useCallback(async (file: File) => {
    abortRef.current = false;
    setIsDemo(false);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    setState({
      stage: 'processing',
      step: 'detecting-face',
      progress: 0,
    });

    try {
      const image = await loadImage(file);

      const cloud = await processImage(
        image,
        (step: ProcessingStep, progress: number) => {
          if (abortRef.current) return;
          setState({ stage: 'processing', step, progress });
        }
      );

      if (!abortRef.current) {
        setState({ stage: 'viewing', cloud });
      }
    } catch (err) {
      if (!abortRef.current) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';
        setState({ stage: 'error', message, canRetry: true });
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current = true;
    setIsDemo(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    setState({ stage: 'upload' });
  }, [previewUrl]);

  const fadeClass = `transition-opacity duration-500 ${fadeIn ? 'opacity-100' : 'opacity-0'}`;

  switch (state.stage) {
    case 'upload':
      return (
        <div className={fadeClass}>
          <ImageUpload onImageSelected={processFile} />
        </div>
      );

    case 'processing':
      return (
        <ProcessingView
          step={state.step}
          progress={state.progress}
          imageUrl={previewUrl}
        />
      );

    case 'viewing':
      return (
        <div className={fadeClass}>
          <ViewerCanvas
            cloud={state.cloud}
            onReset={handleReset}
            isDemo={isDemo}
            onUploadOwn={handleReset}
          />
        </div>
      );

    case 'error':
      return (
        <div className={fadeClass}>
          <ErrorView
            message={state.message}
            canRetry={state.canRetry}
            onRetry={handleReset}
          />
        </div>
      );
  }
}
