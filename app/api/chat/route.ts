/**
 * GovCite RAG Chat API Route
 *
 * Implements the "Read Path" from ARCHITECTURE.md:
 * 1. Query Expansion  - Rewrite user query with legal terminology (GPT-4o-mini)
 * 2. Hybrid Search    - Vector + Keyword search via Supabase RPC (top 20)
 * 3. Re-Ranking       - Cohere Rerank for precision (top 5)
 * 4. Generation       - GPT-4o-mini streaming response with strict citations
 */

import {
  generateText,
  streamText,
  embed,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  UIMessage,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { supabase } from '@/lib/supabase';

// ============================================================================
// Types
// ============================================================================

interface QueryExpansionResult {
  expandedQuery: string;
  state: string | null;
}

interface HybridSearchResult {
  id: string;
  content: string;
  metadata: {
    state: string;
    type: string;
    source: string;
    page?: number;
    section?: string;
    parent_section?: string;
  };
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

/** HybridSearchResult enriched with the Cohere relevance score after reranking. */
interface RankedSearchResult extends HybridSearchResult {
  relevanceScore: number;
}

// ============================================================================
// Constants
// ============================================================================

const HYBRID_SEARCH_COUNT = 20;
const RERANK_TOP_N = 5;
const MIN_CHUNK_LENGTH = 50; // Filter out noise chunks (headers, addenda labels)

// ============================================================================
// Step 1: Query Expansion (GPT-4o-mini)
// ============================================================================

/**
 * Rewrites the user query with precise legal terminology and extracts
 * the target US state (if mentioned) for metadata filtering.
 *
 * Example: "deceased parent claim in Florida"
 *       -> { expandedQuery: "heirship affidavit probate intestate succession Florida", state: "FL" }
 */
async function expandQuery(userMessage: string): Promise<QueryExpansionResult> {
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: `You are a legal query expansion assistant for state unclaimed property law.

Your job is to:
1. Rewrite the user's query using precise legal terminology relevant to unclaimed property, escheatment, and state compliance. Expand colloquial terms into formal legal language (e.g., "deceased parent" → "heirship affidavit probate intestate succession", "old bank account" → "dormant account escheatment holder remittance").
2. Identify the US state mentioned in the query and return its 2-letter code (e.g., "FL", "CA"). If no state is mentioned, return null.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{ "expandedQuery": "the rewritten query with legal terms", "state": "XX" }

If no state is mentioned, use:
{ "expandedQuery": "the rewritten query with legal terms", "state": null }`,
    prompt: userMessage,
  });

  try {
    const parsed = JSON.parse(text);
    return {
      expandedQuery: parsed.expandedQuery || userMessage,
      state: parsed.state || null,
    };
  } catch {
    // Fallback: use original query if LLM response is not valid JSON
    console.error('[Query Expansion] Failed to parse LLM response:', text);
    return { expandedQuery: userMessage, state: null };
  }
}

// ============================================================================
// Step 2: Embed the Expanded Query
// ============================================================================

/**
 * Generates a dense embedding vector using text-embedding-3-small (1536 dims).
 * Must match the model used during ingestion.
 */
async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  });
  return embedding;
}

// ============================================================================
// Step 3: Hybrid Search (Supabase RPC)
// ============================================================================

/**
 * Calls the `hybrid_search` Postgres function which combines:
 * - Dense vector search (cosine similarity)
 * - Keyword search (BM25-style full-text via tsvector)
 * - Reciprocal Rank Fusion (RRF) to merge results
 *
 * Returns top `match_count` chunks, optionally filtered by state.
 */
async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  state: string | null
): Promise<HybridSearchResult[]> {
  const { data, error } = await supabase.rpc('hybrid_search', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: queryText,
    match_count: HYBRID_SEARCH_COUNT,
    filter_state: state,
  });

  if (error) {
    console.error('[Hybrid Search] Supabase RPC error:', error);
    throw new Error(`Hybrid search failed: ${error.message}`);
  }

  return (data as HybridSearchResult[]) || [];
}

// ============================================================================
// Step 4: Cohere Rerank
// ============================================================================

/**
 * Re-ranks the hybrid search results using Cohere Rerank API.
 * Uses the ORIGINAL user query (not expanded) for scoring relevance,
 * since the original captures the user's true intent.
 *
 * Falls back to the top N from hybrid search if Cohere fails.
 */
async function rerankChunks(
  userMessage: string,
  chunks: HybridSearchResult[]
): Promise<RankedSearchResult[]> {
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
    const results: CohereRerankResult[] = data.results;

    // Map reranked indices back to original chunks, enriched with relevance score
    return results.map((r) => ({
      ...chunks[r.index],
      relevanceScore: r.relevance_score,
    }));
  } catch (error) {
    // Graceful degradation: return top 5 from hybrid search order (score 0)
    console.error(
      '[Rerank] Cohere rerank failed, falling back to top 5:',
      error
    );
    return chunks.slice(0, RERANK_TOP_N).map((c) => ({
      ...c,
      relevanceScore: 0,
    }));
  }
}

// ============================================================================
// Step 5: Build System Prompt with Context
// ============================================================================

/**
 * Constructs the system prompt for the "Strict Compliance Officer" persona.
 * Injects the top reranked chunks as numbered source documents.
 */
function buildSystemPrompt(chunks: RankedSearchResult[]): string {
  if (chunks.length === 0) {
    return `You are a Strict Compliance Officer for state unclaimed property law at GovRecover.

No relevant source documents were found for the user's query.
Respond with: "I cannot find this information in the provided state manuals. Please refine your question or specify the state."`;
  }

  const contextBlocks = chunks
    .map((chunk, i) => {
      const source = chunk.metadata?.source || 'Unknown';
      const page = chunk.metadata?.page || 'N/A';
      const section = chunk.metadata?.section || '';
      const state = chunk.metadata?.state || '';

      return `[Document ${i + 1}]
Source: ${source}
State: ${state}
Page: ${page}${section ? `\nSection: ${section}` : ''}

${chunk.content}`;
    })
    .join('\n\n---\n\n');

  return `You are a Strict Compliance Officer for state unclaimed property law at GovRecover.

## Your Rules:
1. Answer ONLY using the provided source documents below. Do NOT use outside knowledge.
2. If the provided documents do not contain sufficient information to answer the question, respond with: "I cannot find this information in the provided state manuals. Please refine your question or specify the state."
3. ALWAYS cite your sources using the format: [Source: {filename}, Page {page number}]
4. When multiple sources support an answer, cite all of them.
5. Be precise with legal requirements — do not paraphrase statutes loosely.
6. If the user asks about a state not represented in the documents, clearly state that.

## Source Documents:

${contextBlocks}`;
}

// ============================================================================
// POST /api/chat — Main Route Handler
// ============================================================================

export async function POST(req: Request) {
  try {
    // Parse request body (Vercel AI SDK useChat format — UIMessages)
    const { messages }: { messages: UIMessage[] } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract the latest user message text from UIMessage parts
    const lastUserMsg = [...messages]
      .reverse()
      .find((m) => m.role === 'user');

    if (!lastUserMsg) {
      return new Response(
        JSON.stringify({ error: 'No user message found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // UIMessages store text in parts[].text
    const userMessage: string =
      lastUserMsg.parts
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ') || '';

    console.log('[GovCite] Processing query:', userMessage);

    // ---- RAG Pipeline ----

    // Step 1: Query Expansion
    console.log('[GovCite] Step 1: Expanding query...');
    const { expandedQuery, state } = await expandQuery(userMessage);
    console.log('[GovCite] Expanded:', expandedQuery, '| State:', state);

    // Step 2: Embed the expanded query
    console.log('[GovCite] Step 2: Generating embedding...');
    const queryEmbedding = await embedQuery(expandedQuery);

    // Step 3: Hybrid Search (Vector + Keyword via Supabase RPC)
    console.log('[GovCite] Step 3: Hybrid search...');
    const searchResults = await hybridSearch(
      queryEmbedding,
      expandedQuery,
      state
    );
    console.log(`[GovCite] Found ${searchResults.length} hybrid results`);

    // Filter out noise chunks (tiny headers, addenda labels, etc.)
    const substantiveResults = searchResults.filter(
      (r) => r.content && r.content.length >= MIN_CHUNK_LENGTH
    );
    console.log(
      `[GovCite] After filtering: ${substantiveResults.length} substantive chunks (removed ${searchResults.length - substantiveResults.length} noise chunks)`
    );

    // Step 4: Rerank with Cohere
    console.log('[GovCite] Step 4: Reranking with Cohere...');
    const topChunks = await rerankChunks(userMessage, substantiveResults);
    console.log(`[GovCite] Selected top ${topChunks.length} chunks`);

    // Step 5: Stream response with GPT-4o-mini
    console.log('[GovCite] Step 5: Generating streamed response...');
    const systemPrompt = buildSystemPrompt(topChunks);

    // Convert UIMessages to ModelMessages for streamText
    const modelMessages = await convertToModelMessages(messages);

    // Build source data to send alongside the stream
    const sourcesData = topChunks.map((chunk, i) => ({
      content: chunk.content,
      source: chunk.metadata?.source || 'Unknown',
      page: chunk.metadata?.page || null,
      state: chunk.metadata?.state || '',
      section: chunk.metadata?.section || '',
      rank: i + 1,
      relevanceScore: chunk.relevanceScore ?? 0,
    }));

    // Create a UI message stream with custom source data + LLM response
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Send source chunks as a custom data part
        writer.write({
          type: 'data-sources' as const,
          data: sourcesData,
        } as never);

        // Merge the LLM stream
        const result = streamText({
          model: openai('gpt-4o-mini'),
          system: systemPrompt,
          messages: modelMessages,
        });

        writer.merge(result.toUIMessageStream());
      },
      onError: (error) => {
        console.error('[GovCite] Stream error:', error);
        return 'An error occurred while generating the response.';
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('[GovCite] Pipeline error:', error);
    return new Response(
      JSON.stringify({
        error: 'An error occurred processing your request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
