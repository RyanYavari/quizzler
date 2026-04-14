'use client';

import type { QuizQuestion } from '@/lib/types';

interface QuizQuestionProps {
  question: QuizQuestion;
  index: number;
  selectedOption: number | undefined;
  onSelect: (questionId: string, optionIndex: number) => void;
}

export default function QuizQuestionCard({
  question,
  index,
  selectedOption,
  onSelect,
}: QuizQuestionProps) {
  return (
    <div className="rounded-xl border border-border bg-white p-6 space-y-4">
      <h3 className="font-medium text-foreground">
        <span className="text-primary font-bold mr-2">Q{index + 1}.</span>
        {question.question}
      </h3>

      <div className="space-y-2">
        {question.options.map((option, i) => (
          <button
            key={i}
            onClick={() => onSelect(question.id, i)}
            className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-all ${
              selectedOption === i
                ? 'border-primary bg-accent text-primary font-medium ring-2 ring-primary/20'
                : 'border-border hover:border-primary/40 hover:bg-accent/30'
            }`}
          >
            <span className="font-medium mr-2 text-muted-foreground">
              {String.fromCharCode(65 + i)}.
            </span>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
