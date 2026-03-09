import type { ProcessingStep } from '../types';
import { STEP_LABELS } from '../types';

interface ProcessingViewProps {
  step: ProcessingStep;
  progress: number;
  imageUrl?: string;
}

const STEPS: ProcessingStep[] = [
  'detecting-face',
  'estimating-depth',
  'generating-gaussians',
  'initializing-renderer',
];

export function ProcessingView({ step, progress, imageUrl }: ProcessingViewProps) {
  const currentIndex = STEPS.indexOf(step);
  const overallProgress = ((currentIndex + progress / 100) / STEPS.length) * 100;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="max-w-md w-full">
        {/* Preview thumbnail */}
        {imageUrl && (
          <div className="mb-8 flex justify-center">
            <div className="w-32 h-32 rounded-xl overflow-hidden ring-2 ring-gray-700">
              <img
                src={imageUrl}
                alt="Your photo"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        <h2 className="text-xl font-semibold text-white text-center mb-8">
          Building your 3D portrait
        </h2>

        {/* Overall progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-2 mb-8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Step list */}
        <div className="space-y-3">
          {STEPS.map((s, i) => {
            const isActive = i === currentIndex;
            const isDone = i < currentIndex;
            return (
              <div
                key={s}
                className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                  isActive
                    ? 'text-white'
                    : isDone
                      ? 'text-green-400'
                      : 'text-gray-600'
                }`}
              >
                {/* Status icon */}
                <div className="w-5 h-5 flex items-center justify-center">
                  {isDone ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : isActive ? (
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-gray-700" />
                  )}
                </div>

                <span className={isActive ? 'font-medium' : ''}>
                  {STEP_LABELS[s]}
                </span>

                {isActive && (
                  <span className="text-gray-500 text-xs ml-auto">
                    {Math.round(progress)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-gray-500 text-xs text-center mt-8">
          First run downloads ML models (~30MB). Subsequent runs are faster.
        </p>

        {/* Screen reader announcement */}
        <div className="sr-only" role="status" aria-live="polite">
          {STEP_LABELS[step]} {Math.round(overallProgress)}% complete.
        </div>
      </div>
    </div>
  );
}
