'use client';

import type { QuizQuestion } from '@/lib/types';

interface ReviewQuestionProps {
  question: QuizQuestion;
  index: number;
  userAnswer: number | undefined;
}

export default function ReviewQuestion({
  question,
  index,
  userAnswer,
}: ReviewQuestionProps) {
  const isCorrect = userAnswer === question.correctIndex;

  return (
    <div
      className={`rounded-xl border-2 p-5 space-y-3 shadow-lg ${
        isCorrect
          ? 'border-emerald-500/50 bg-emerald-950/30'
          : 'border-rose-500/50 bg-rose-950/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`text-lg ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isCorrect ? '✓' : '✗'}
        </span>
        <h3 className="font-medium text-foreground">
          <span className="text-primary font-bold mr-1">Q{index + 1}.</span>
          {question.question}
        </h3>
      </div>

      <div className="space-y-1.5 ml-7">
        {question.options.map((option, i) => {
          const isUserChoice = i === userAnswer;
          const isCorrectOption = i === question.correctIndex;
          let classes = 'rounded-lg border px-3 py-2 text-sm';

          if (isCorrectOption) {
            classes += ' correct-answer border-emerald-500/50 bg-emerald-500/20 text-emerald-200 font-medium';
          } else if (isUserChoice && !isCorrect) {
            classes += ' wrong-answer border-rose-500/50 bg-rose-500/20 text-rose-200 line-through';
          } else {
            classes += ' border-transparent text-muted-foreground';
          }

          return (
            <div key={i} className={classes}>
              <span className="font-medium mr-2">
                {String.fromCharCode(65 + i)}.
              </span>
              {option}
            </div>
          );
        })}
      </div>

      {/* Explanation */}
      <div className="ml-7 mt-2 rounded-lg bg-accent px-3 py-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Explanation: </span>
        {question.explanation}
      </div>
    </div>
  );
}
