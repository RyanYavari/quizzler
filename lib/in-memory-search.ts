import { traceable } from 'langsmith/traceable';
import type { SessionChunk } from './types';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}

export const inMemorySearch = traceable(
  async (
    queryEmbedding: number[],
    chunks: SessionChunk[],
    topK: number = 20
  ): Promise<SessionChunk[]> => {
    const scored = chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map((s) => s.chunk);
  },
  { name: 'in_memory_search', run_type: 'retriever' }
);
