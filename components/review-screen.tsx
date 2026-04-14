'use client';

import type { QuizQuestion, QuizResult } from '@/lib/types';
import QuizReview from './quiz-review';
import TutorChat from './tutor-chat';

interface ReviewScreenProps {
  quiz: QuizQuestion[];
  result: QuizResult;
  sessionId: string;
  onStartOver: () => void;
}

export default function ReviewScreen({
  quiz,
  result,
  sessionId,
  onStartOver,
}: ReviewScreenProps) {
  return (
    <div className="flex h-[calc(100vh-80px)]">
      {/* Left: Quiz Review (70%) */}
      <div className="w-[70%]">
        <QuizReview quiz={quiz} result={result} onStartOver={onStartOver} />
      </div>

      {/* Right: Tutor Chat (30%) */}
      <div className="w-[30%]">
        <TutorChat
          sessionId={sessionId}
          userAnswers={result.userAnswers}
          score={result.score}
          total={result.total}
        />
      </div>
    </div>
  );
}
