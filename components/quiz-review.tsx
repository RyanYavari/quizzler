'use client';

import type { QuizQuestion, QuizResult } from '@/lib/types';
import ScoreReveal from './score-reveal';
import ReviewQuestion from './review-question';

interface QuizReviewProps {
  quiz: QuizQuestion[];
  result: QuizResult;
  onStartOver: () => void;
}

export default function QuizReview({
  quiz,
  result,
  onStartOver,
}: QuizReviewProps) {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <ScoreReveal score={result.score} total={result.total} />

      <div className="space-y-4">
        {quiz.map((q, i) => (
          <ReviewQuestion
            key={q.id}
            question={q}
            index={i}
            userAnswer={result.userAnswers[q.id]}
          />
        ))}
      </div>

      <div className="flex justify-center pb-4">
        <button
          onClick={onStartOver}
          className="rounded-xl border border-border bg-white px-6 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
