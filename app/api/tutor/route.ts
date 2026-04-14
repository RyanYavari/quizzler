import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  UIMessage,
} from 'ai';
import { traceable } from 'langsmith/traceable';
import {
  tracedModel,
  expandQuery,
  embedQuery,
  rerankChunks,
} from '@/lib/rag-pipeline';
import { inMemorySearch } from '@/lib/in-memory-search';
import { sessionStore } from '@/lib/session-store';
import type { QuizQuestion } from '@/lib/types';
import fs from 'fs';
import path from 'path';

const tutorPromptTemplate = fs.readFileSync(
  path.join(process.cwd(), 'prompts/tutor-system.md'),
  'utf-8'
);

const MIN_CHUNK_LENGTH = 50;

function buildQuizContext(
  quiz: QuizQuestion[],
  userAnswers: Record<string, number>,
  score: number,
  total: number
): string {
  return quiz
    .map((q) => {
      const userAnswer = userAnswers[q.id];
      const isCorrect = userAnswer === q.correctIndex;
      const userChoice =
        userAnswer !== undefined ? q.options[userAnswer] : 'Not answered';
      return `Q: ${q.question}
Correct Answer: ${q.options[q.correctIndex]}
Student's Answer: ${userChoice} ${isCorrect ? '(CORRECT)' : '(INCORRECT)'}
Explanation: ${q.explanation}`;
    })
    .join('\n\n');
}

const tutorRagPipeline = traceable(
  async (
    userMessage: string,
    sessionId: string,
    userAnswers: Record<string, number>,
    score: number,
    total: number
  ) => {
    const session = sessionStore.get(sessionId);
    if (!session) {
      throw new Error('Session not found or expired');
    }

    // Step 1: Query Expansion
    console.log('[Tutor] Step 1: Expanding query...');
    const { expandedQuery } = await expandQuery(userMessage);

    // Step 2: Embed query
    console.log('[Tutor] Step 2: Embedding query...');
    const queryEmbedding = await embedQuery(expandedQuery);

    // Step 3: In-memory search (top 20)
    console.log('[Tutor] Step 3: In-memory search...');
    const searchResults = await inMemorySearch(
      queryEmbedding,
      session.chunks,
      20
    );

    // Filter noise chunks
    const substantiveResults = searchResults.filter(
      (r) => r.content && r.content.length >= MIN_CHUNK_LENGTH
    );

    // Step 4: Cohere rerank (top 5)
    console.log('[Tutor] Step 4: Reranking...');
    const topChunks = await rerankChunks(userMessage, substantiveResults);

    // Build context blocks for prompt
    const chunksContext = topChunks
      .map((chunk, i) => {
        const source = chunk.metadata?.source || 'Unknown';
        const page = chunk.metadata?.page || 'N/A';
        return `[Document ${i + 1}]
Source: ${source}
Page: ${page}

${chunk.content}`;
      })
      .join('\n\n---\n\n');

    // Build quiz context
    const quizContext = buildQuizContext(
      session.quiz,
      userAnswers,
      score,
      total
    );

    // Interpolate tutor system prompt
    const systemPrompt = tutorPromptTemplate
      .replace('{chunks}', chunksContext || 'No relevant documents found.')
      .replace('{quiz}', quizContext)
      .replace('{score}', `${score}/${total}`)
      .replace('{filename}', session.fileName);

    // Build sources data for citations
    const sourcesData = topChunks.map((chunk, i) => ({
      content: chunk.content,
      source: chunk.metadata?.source || 'Unknown',
      page: chunk.metadata?.page || null,
      chunkIndex: chunk.metadata?.chunkIndex ?? i,
      rank: i + 1,
      relevanceScore:
        'relevanceScore' in chunk
          ? (chunk as typeof chunk & { relevanceScore: number }).relevanceScore
          : 0,
    }));

    return { systemPrompt, sourcesData };
  },
  { name: 'tutor_rag_pipeline', run_type: 'chain' }
);

export async function POST(req: Request) {
  console.log('[Tutor Route] POST request received');
  try {
    const body = await req.json();
    console.log('[Tutor Route] Request body:', JSON.stringify(body).slice(0, 200));

    const {
      messages,
      sessionId,
      userAnswers = {},
      score = 0,
      total = 0,
    }: {
      messages: UIMessage[];
      sessionId: string;
      userAnswers?: Record<string, number>;
      score?: number;
      total?: number;
    } = body;

    if (!sessionId) {
      console.log('[Tutor Route] Error: No sessionId');
      return new Response(
        JSON.stringify({ error: 'sessionId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Tutor Route] Looking up session:', sessionId);
    const session = sessionStore.get(sessionId);
    if (!session) {
      console.log('[Tutor Route] Error: Session not found');
      return new Response(
        JSON.stringify({ error: 'Session not found or expired' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Tutor Route] Session found, chunks:', session.chunks.length);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('[Tutor Route] Error: Invalid messages');
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Tutor Route] Messages valid, count:', messages.length);

    // Extract user message text
    const lastUserMsg = [...messages]
      .reverse()
      .find((m) => m.role === 'user');

    const userMessage: string =
      lastUserMsg?.parts
        ?.filter(
          (p): p is { type: 'text'; text: string } => p.type === 'text'
        )
        .map((p) => p.text)
        .join(' ') || '';

    // Run traced RAG pipeline
    const { systemPrompt, sourcesData } = await tutorRagPipeline(
      userMessage,
      sessionId,
      userAnswers,
      score,
      total
    );

    // Stream response
    const modelMessages = await convertToModelMessages(messages);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        console.log('[Tutor] Starting stream execution...');

        // Write citations as data event first
        writer.write({
          type: 'data-sources' as const,
          data: sourcesData,
        } as never);
        console.log('[Tutor] Citations data written');

        const result = streamText({
          model: tracedModel,
          system: systemPrompt,
          messages: modelMessages,
        });

        console.log('[Tutor] Merging text stream...');
        // Use the original merge approach for proper text streaming
        writer.merge(result.toUIMessageStream());

        console.log('[Tutor] Stream merged successfully');
      },
      onError: (error) => {
        console.error('[Tutor] Stream error:', error);
        return 'An error occurred while generating the response.';
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('[Tutor] Pipeline error:', error);
    return new Response(
      JSON.stringify({
        error: 'An error occurred processing your request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
