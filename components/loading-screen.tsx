'use client';

import type { UploadStage } from '@/lib/types';

interface LoadingScreenProps {
  stage: UploadStage;
  message: string;
}

const STAGES: { key: UploadStage; label: string }[] = [
  { key: 'parsing', label: 'Parsing' },
  { key: 'chunking', label: 'Chunking' },
  { key: 'processing', label: 'Processing' },
  { key: 'complete', label: 'Complete' },
];

function getStageIndex(stage: UploadStage): number {
  return STAGES.findIndex((s) => s.key === stage);
}

export default function LoadingScreen({ stage, message }: LoadingScreenProps) {
  const currentIndex = getStageIndex(stage);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Spinner */}
        <div className="flex justify-center">
          <div className="loading-spinner h-16 w-16 rounded-full border-4 border-muted border-t-primary" />
        </div>

        {/* Message */}
        <p className="text-center text-lg font-medium text-foreground">
          {message}
        </p>

        {/* Step indicator */}
        <div className="flex items-center justify-between">
          {STAGES.map((s, i) => {
            const isActive = i === currentIndex;
            const isComplete = i < currentIndex;
            return (
              <div key={s.key} className="flex flex-col items-center gap-2">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isComplete
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                      : isActive
                        ? 'bg-primary text-primary-foreground loading-pulse shadow-md shadow-primary/30'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isComplete ? '✓' : i + 1}
                </div>
                <span
                  className={`text-xs ${
                    isActive
                      ? 'text-primary font-medium'
                      : isComplete
                        ? 'text-emerald-400'
                        : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
