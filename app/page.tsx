'use client';

import { useState, useCallback } from 'react';
import { GraduationCap } from 'lucide-react';
import type {
  AppScreen,
  QuizQuestion,
  QuizResult,
  UploadStage,
} from '@/lib/types';
import UploadScreen from '@/components/upload-screen';
import LoadingScreen from '@/components/loading-screen';
import QuizScreen from '@/components/quiz-screen';
import ReviewScreen from '@/components/review-screen';

export default function Home() {
  const [screen, setScreen] = useState<AppScreen>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [loadingStage, setLoadingStage] = useState<UploadStage>('parsing');
  const [loadingMessage, setLoadingMessage] = useState('Preparing...');

  const handleUploadStart = useCallback(
    async (data: FormData | { text: string; questionCount: number }) => {
      setScreen('loading');
      setLoadingStage('parsing');
      setLoadingMessage('Parsing your content...');

      try {
        const isFormData = data instanceof FormData;
        const fetchOptions: RequestInit = isFormData
          ? { method: 'POST', body: data }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            };

        const response = await fetch('/api/upload', fetchOptions);

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ') && eventType) {
              const jsonData = JSON.parse(line.slice(6));

              if (eventType === 'progress') {
                setLoadingStage(jsonData.stage);
                setLoadingMessage(jsonData.message);
              } else if (eventType === 'result') {
                setSessionId(jsonData.sessionId);
                setQuiz(jsonData.quiz);
                setScreen('quiz');
              } else if (eventType === 'error') {
                throw new Error(jsonData.message);
              }

              eventType = '';
            }
          }
        }
      } catch (error) {
        console.error('[Upload] Error:', error);
        alert(
          error instanceof Error
            ? error.message
            : 'Upload failed. Please try again.'
        );
        setScreen('upload');
      }
    },
    []
  );

  const handleAnswer = useCallback(
    (questionId: string, optionIndex: number) => {
      setUserAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
    },
    []
  );

  const handleQuizSubmit = useCallback(() => {
    let score = 0;
    for (const q of quiz) {
      if (userAnswers[q.id] === q.correctIndex) {
        score++;
      }
    }

    setQuizResult({
      userAnswers,
      score,
      total: quiz.length,
    });
    setScreen('review');
  }, [quiz, userAnswers]);

  const handleStartOver = useCallback(() => {
    setScreen('upload');
    setSessionId(null);
    setQuiz([]);
    setUserAnswers({});
    setQuizResult(null);
    setLoadingStage('parsing');
    setLoadingMessage('Preparing...');
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white px-6 py-4 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary leading-tight">
                Quizzler
              </h1>
              <p className="text-xs text-muted-foreground">
                Quiz-first study tool with AI-powered tutoring
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Screen router */}
      <main className="flex-1 overflow-y-auto">
        {screen === 'upload' && <UploadScreen onUpload={handleUploadStart} />}
        {screen === 'loading' && (
          <LoadingScreen stage={loadingStage} message={loadingMessage} />
        )}
        {screen === 'quiz' && (
          <QuizScreen
            quiz={quiz}
            userAnswers={userAnswers}
            onAnswer={handleAnswer}
            onSubmit={handleQuizSubmit}
          />
        )}
        {screen === 'review' && quizResult && sessionId && (
          <ReviewScreen
            quiz={quiz}
            result={quizResult}
            sessionId={sessionId}
            onStartOver={handleStartOver}
          />
        )}
      </main>
    </div>
  );
}
