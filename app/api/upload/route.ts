import { parseUpload } from '@/lib/parse-upload';
import { chunkText } from '@/lib/chunker';
import { embedBatch } from '@/lib/rag-pipeline';
import { generateQuiz } from '@/lib/quiz-generator';
import { sessionStore } from '@/lib/session-store';
import type { SessionChunk, Session } from '@/lib/types';

export const maxDuration = 120;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Parse upload
        controller.enqueue(
          encoder.encode(
            sseEvent('progress', { stage: 'parsing', message: 'Parsing your content...' })
          )
        );

        const { text, fileName, questionCount } = await parseUpload(req);

        // Step 2: Chunk text
        controller.enqueue(
          encoder.encode(
            sseEvent('progress', { stage: 'chunking', message: 'Breaking content into chunks...' })
          )
        );

        const chunkTexts = chunkText(text);

        // Step 3: Parallel — embed chunks + generate quiz
        controller.enqueue(
          encoder.encode(
            sseEvent('progress', {
              stage: 'processing',
              message: 'Generating embeddings and quiz questions...',
            })
          )
        );

        const [embeddings, quiz] = await Promise.all([
          embedBatch(chunkTexts),
          generateQuiz(text, questionCount),
        ]);

        // Build session chunks
        const chunks: SessionChunk[] = chunkTexts.map((content, i) => ({
          id: `chunk-${i}`,
          content,
          embedding: embeddings[i],
          metadata: {
            source: fileName,
            chunkIndex: i,
          },
        }));

        // Store session
        const sessionId = crypto.randomUUID();
        const session: Session = {
          id: sessionId,
          chunks,
          quiz,
          fileName,
          createdAt: Date.now(),
        };

        sessionStore.set(sessionId, session);
        console.log('[Upload] Session stored:', sessionId, 'chunks:', chunks.length);

        // Step 4: Complete
        controller.enqueue(
          encoder.encode(
            sseEvent('progress', { stage: 'complete', message: 'Ready!' })
          )
        );

        controller.enqueue(
          encoder.encode(
            sseEvent('result', {
              sessionId,
              quiz,
              metadata: {
                fileName,
                chunkCount: chunks.length,
                questionCount: quiz.length,
              },
            })
          )
        );

        controller.close();
      } catch (error) {
        console.error('[Upload] Error:', error);
        controller.enqueue(
          encoder.encode(
            sseEvent('error', {
              message:
                error instanceof Error
                  ? error.message
                  : 'An unexpected error occurred',
            })
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
