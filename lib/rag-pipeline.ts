import { generateText, embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { traceable } from 'langsmith/traceable';
import { wrapAISDKModel } from 'langsmith/wrappers/vercel';
import type { SessionChunk } from './types';
import fs from 'fs';
import path from 'path';

// Traced LLM model
export const tracedModel = wrapAISDKModel(openai('gpt-4o-mini'));

// Load prompts
const queryExpansionPrompt = fs.readFileSync(
  path.join(process.cwd(), 'prompts/query-expansion.md'),
  'utf-8'
);

// ============================================================================
// Step 1: Query Expansion
// ============================================================================

interface QueryExpansionResult {
  expandedQuery: string;
}

export const expandQuery = traceable(
  async (userMessage: string): Promise<QueryExpansionResult> => {
    const { text } = await generateText({
      model: tracedModel,
      system: queryExpansionPrompt,
      prompt: userMessage,
    });

    try {
      const parsed = JSON.parse(text);
      return { expandedQuery: parsed.expandedQuery || userMessage };
    } catch {
      console.error('[Query Expansion] Failed to parse LLM response:', text);
      return { expandedQuery: userMessage };
    }
  },
  { name: 'expand_query', run_type: 'chain' }
);

// ============================================================================
// Step 2: Embed Query
// ============================================================================

export const embedQuery = traceable(
  async (query: string): Promise<number[]> => {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: query,
    });
    return embedding;
  },
  { name: 'embed_query', run_type: 'embedding' }
);

// ============================================================================
// Embed Batch (for chunked content during upload)
// ============================================================================

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: texts,
  });
  return embeddings;
}

// ============================================================================
// Step 4: Cohere Rerank
// ============================================================================

const RERANK_TOP_N = 5;

interface RankedChunk extends SessionChunk {
  relevanceScore: number;
}

export const rerankChunks = traceable(
  async (
    userMessage: string,
    chunks: SessionChunk[]
  ): Promise<RankedChunk[]> => {
    if (chunks.length === 0) return [];

    try {
      const response = await fetch('https://api.cohere.com/v2/rerank', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'rerank-english-v3.0',
          query: userMessage,
          documents: chunks.map((c) => c.content),
          top_n: RERANK_TOP_N,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Cohere API error: ${response.status} ${response.statusText} - ${errorBody}`
        );
      }

      const data = await response.json();
      const results: { index: number; relevance_score: number }[] =
        data.results;

      return results.map((r) => ({
        ...chunks[r.index],
        relevanceScore: r.relevance_score,
      }));
    } catch (error) {
      console.error(
        '[Rerank] Cohere rerank failed, falling back to top 5:',
        error
      );
      return chunks.slice(0, RERANK_TOP_N).map((c) => ({
        ...c,
        relevanceScore: 0,
      }));
    }
  },
  {
    name: 'cohere_rerank',
    run_type: 'chain',
    processOutputs: (outputs) => {
      const ranked = (outputs as { outputs: RankedChunk[] }).outputs;
      return {
        top_chunks: ranked.length,
        cohere_scores: ranked.map((r) => ({
          source: r.metadata?.source,
          relevance_score: r.relevanceScore,
        })),
      };
    },
  }
);
