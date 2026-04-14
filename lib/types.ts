export type AppScreen = 'upload' | 'loading' | 'quiz' | 'review';

export interface QuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

export interface SessionChunk {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    chunkIndex: number;
    page?: number;
  };
}

export interface Session {
  id: string;
  chunks: SessionChunk[];
  quiz: QuizQuestion[];
  fileName: string;
  createdAt: number;
}

export interface QuizResult {
  userAnswers: Record<string, number>;
  score: number;
  total: number;
}

export interface Citation {
  content: string;
  source: string;
  page: number | null;
  chunkIndex: number;
  rank: number;
  relevanceScore: number;
}

export type UploadStage = 'parsing' | 'chunking' | 'processing' | 'complete';

export interface UploadProgress {
  stage: UploadStage;
  message: string;
}

export interface UploadResult {
  sessionId: string;
  quiz: QuizQuestion[];
  metadata: {
    fileName: string;
    chunkCount: number;
    questionCount: number;
  };
}
