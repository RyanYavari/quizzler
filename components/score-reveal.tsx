'use client';

import { useEffect, useState } from 'react';

interface ScoreRevealProps {
  score: number;
  total: number;
}

function getEmoji(score: number, total: number): string {
  const pct = score / total;
  if (pct === 1) return '🏆';
  if (pct >= 0.8) return '🎉';
  if (pct >= 0.6) return '👍';
  if (pct >= 0.4) return '💪';
  return '📚';
}

function getMessage(score: number, total: number): string {
  const pct = score / total;
  if (pct === 1) return 'Perfect score!';
  if (pct >= 0.8) return 'Great job!';
  if (pct >= 0.6) return 'Good effort!';
  if (pct >= 0.4) return 'Keep studying!';
  return "Let's review together!";
}

export default function ScoreReveal({ score, total }: ScoreRevealProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(true);
    let current = 0;
    const interval = setInterval(() => {
      current++;
      setDisplayScore(current);
      if (current >= score) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [score]);

  return (
    <div
      className={`rounded-xl bg-gradient-to-r from-primary/10 via-accent to-primary/10 p-6 text-center transition-all duration-500 ${
        revealed ? 'score-reveal' : 'opacity-0 scale-95'
      }`}
    >
      <div className="text-4xl mb-2">{getEmoji(score, total)}</div>
      <div className="text-3xl font-bold text-primary">
        {displayScore} / {total}
      </div>
      <p className="text-muted-foreground mt-1 font-medium">
        {getMessage(score, total)}
      </p>
    </div>
  );
}
