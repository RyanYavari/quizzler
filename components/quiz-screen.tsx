'use client';

import type { QuizQuestion } from '@/lib/types';
import QuizQuestionCard from './quiz-question';

interface QuizScreenProps {
  quiz: QuizQuestion[];
  userAnswers: Record<string, number>;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onSubmit: () => void;
}

export default function QuizScreen({
  quiz,
  userAnswers,
  onAnswer,
  onSubmit,
}: QuizScreenProps) {
  const allAnswered = quiz.every((q) => userAnswers[q.id] !== undefined);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Quiz Time!</h2>
        <p className="text-muted-foreground">
          Answer all {quiz.length} questions, then submit to see your results
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {Object.keys(userAnswers).length} of {quiz.length} answered
        </span>
        <div className="w-48 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{
              width: `${(Object.keys(userAnswers).length / quiz.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {quiz.map((q, i) => (
          <QuizQuestionCard
            key={q.id}
            question={q}
            index={i}
            selectedOption={userAnswers[q.id]}
            onSelect={onAnswer}
          />
        ))}
      </div>

      {/* Submit */}
      <div className="sticky bottom-4 flex justify-center">
        <button
          onClick={onSubmit}
          disabled={!allAnswered}
          className="rounded-xl bg-primary text-primary-foreground px-8 py-3 font-medium text-sm shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {allAnswered ? 'Submit Quiz' : `Answer all questions to submit`}
        </button>
      </div>
    </div>
  );
}
