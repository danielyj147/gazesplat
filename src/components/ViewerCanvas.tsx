import { useRef, useEffect, useCallback, useState } from 'react';
import type { GaussianCloud } from '../types';
import { SplatRenderer } from '../renderer/SplatRenderer';
import { GazeController } from '../gaze/gazeController';
import { degToRad } from '../utils/mathUtils';

interface ViewerCanvasProps {
  cloud: GaussianCloud;
  onReset?: () => void;
  isDemo?: boolean;
  onUploadOwn?: () => void;
}

export function ViewerCanvas({ cloud, onReset, isDemo, onUploadOwn }: ViewerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SplatRenderer | null>(null);
  const gazeRef = useRef<GazeController | null>(null);
  const animRef = useRef<number | null>(null);
  const [fps, setFps] = useState(0);
  const [gazeEnabled, setGazeEnabled] = useState(true);
  const fpsFrames = useRef(0);
  const fpsLastTime = useRef(performance.now());

  const toggleGaze = useCallback(() => {
    setGazeEnabled(prev => {
      const next = !prev;
      if (gazeRef.current) gazeRef.current.gazeEnabled = next;
      return next;
    });
  }, []);

  // Keyboard controls for accessibility
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const camera = renderer.getCamera();
    const step = degToRad(3);
    const zoomStep = 0.05;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        camera.state.azimuth = Math.max(camera.state.azimuth - step, degToRad(-50));
        camera.updateMatrices();
        break;
      case 'ArrowRight':
        e.preventDefault();
        camera.state.azimuth = Math.min(camera.state.azimuth + step, degToRad(50));
        camera.updateMatrices();
        break;
      case 'ArrowUp':
        e.preventDefault();
        camera.state.elevation = Math.min(camera.state.elevation + step, degToRad(45));
        camera.updateMatrices();
        break;
      case 'ArrowDown':
        e.preventDefault();
        camera.state.elevation = Math.max(camera.state.elevation - step, degToRad(-45));
        camera.updateMatrices();
        break;
      case '+':
      case '=':
        camera.state.distance = Math.max(camera.state.distance - zoomStep, 0.1);
        camera.updateMatrices();
        break;
      case '-':
        camera.state.distance = Math.min(camera.state.distance + zoomStep, 2.0);
        camera.updateMatrices();
        break;
      case 'r':
      case 'R':
        camera.state.azimuth = 0;
        camera.state.elevation = 0;
        camera.state.distance = 1.2;
        camera.updateMatrices();
        break;
      case 'g':
      case 'G':
        toggleGaze();
        break;
    }
  }, [toggleGaze]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: SplatRenderer;
    try {
      renderer = new SplatRenderer(canvas, cloud);
    } catch (e) {
      console.error('Failed to initialize renderer:', e);
      return;
    }

    rendererRef.current = renderer;
    const gaze = new GazeController(renderer, cloud, canvas);
    gazeRef.current = gaze;

    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      gaze.update(dt);

      // FPS counter
      fpsFrames.current++;
      if (now - fpsLastTime.current >= 1000) {
        setFps(fpsFrames.current);
        fpsFrames.current = 0;
        fpsLastTime.current = now;
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    // Keyboard listener
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      gaze.destroy();
      renderer.destroy();
      rendererRef.current = null;
      gazeRef.current = null;
    };
  }, [cloud, handleKeyDown]);

  return (
    <div className="relative w-full h-screen bg-[#14141e]">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        tabIndex={0}
        role="application"
        aria-label="Interactive 3D portrait viewer. Use arrow keys to orbit, +/- to zoom, R to reset."
      />

      {/* Vignette overlay for cinematic feel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(10,10,15,0.6) 100%)',
        }}
      />

      {/* Controls overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 text-sm text-gray-400 flex items-center gap-4">
          <span>Drag to orbit</span>
          <span className="text-gray-600">|</span>
          <span>Scroll to zoom</span>
          <span className="text-gray-600">|</span>
          <button
            onClick={toggleGaze}
            className={`flex items-center gap-1.5 transition-colors ${gazeEnabled ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 hover:text-gray-400'}`}
            title={`${gazeEnabled ? 'Disable' : 'Enable'} eye tracking (G)`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {gazeEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              )}
              {gazeEnabled && <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
            <span>Gaze {gazeEnabled ? 'on' : 'off'}</span>
          </button>
          <span className="text-gray-600">|</span>
          <span>Keys: arrows / +- / R / G</span>
        </div>
      </div>

      {/* Photo credit */}
      {isDemo && (
        <div className="absolute bottom-6 right-4 text-xs text-gray-600">
          Photo by <a href="https://unsplash.com/@itsjosephgonzalez" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">Joseph Gonzalez</a> on <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">Unsplash</a>
        </div>
      )}

      {/* Demo CTA — prominent upload invite */}
      {isDemo && onUploadOwn && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          <button
            onClick={onUploadOwn}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-5 py-3 font-medium transition-all hover:scale-105 shadow-lg shadow-blue-600/30 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.345A4.5 4.5 0 0117.25 19.5H6.75z" />
            </svg>
            Try Your Own Photo
          </button>
          <span className="text-xs text-gray-500">This is a sample portrait</span>
        </div>
      )}

      {/* Reset button (non-demo mode) */}
      {!isDemo && onReset && (
        <button
          onClick={onReset}
          className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-black/80 transition-colors"
          aria-label="Upload new photo"
        >
          New Photo
        </button>
      )}

      {/* Title and FPS */}
      <div className="absolute top-4 left-4 flex items-center gap-3">
        <span className="text-white/80 text-sm font-medium">GazeSplat</span>
        <span className="text-xs text-gray-500 tabular-nums">{fps} FPS</span>
        <span className="text-xs text-gray-600">{(cloud.count / 1000).toFixed(0)}K splats</span>
      </div>

      {/* Screen reader status */}
      <div className="sr-only" role="status" aria-live="polite">
        3D portrait ready. Use arrow keys to orbit the view, plus and minus to zoom, R to reset camera.
      </div>
    </div>
  );
}
