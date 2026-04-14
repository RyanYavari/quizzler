'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { QuizQuestion, QuizResult } from '@/lib/types';
import QuizReview from './quiz-review';
import TutorChat from './tutor-chat';
import ResizableDivider from './resizable-divider';

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
  const [splitRatio, setSplitRatio] = useState(70);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load split ratio from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('quizzler-split-ratio');
      if (stored) {
        const ratio = parseInt(stored, 10);
        if (ratio >= 30 && ratio <= 80) {
          setSplitRatio(ratio);
        }
      }
    } catch (error) {
      // Gracefully handle localStorage errors (e.g., incognito mode)
      console.warn('Could not load split ratio from localStorage:', error);
    }
  }, []);

  // Save split ratio to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('quizzler-split-ratio', String(splitRatio));
      } catch (error) {
        // Gracefully handle localStorage errors
        console.warn('Could not save split ratio to localStorage:', error);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [splitRatio]);

  // Handle mouse move during drag
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newRatio = (x / rect.width) * 100;

      // Clamp between 30% and 80%
      const clampedRatio = Math.max(30, Math.min(80, newRatio));
      setSplitRatio(clampedRatio);
    },
    [isDragging]
  );

  // Handle mouse up (end drag)
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.userSelect = '';
  }, []);

  // Add/remove global mouse event listeners during drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.userSelect = '';
    };
  }, []);

  // Start dragging
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.userSelect = 'none';
  }, []);

  // Reset to default 70/30 split
  const handleResetSplit = useCallback(() => {
    setSplitRatio(70);
  }, []);

  return (
    <div
      ref={containerRef}
      data-review-container
      className="flex h-[calc(100vh-80px)]"
    >
      {/* Left: Quiz Review */}
      <div style={{ width: `${splitRatio}%` }}>
        <QuizReview quiz={quiz} result={result} onStartOver={onStartOver} />
      </div>

      {/* Resizable Divider */}
      <ResizableDivider
        isDragging={isDragging}
        onMouseDown={handleDragStart}
        onDoubleClick={handleResetSplit}
      />

      {/* Right: Tutor Chat */}
      <div style={{ width: `${100 - splitRatio}%` }}>
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
