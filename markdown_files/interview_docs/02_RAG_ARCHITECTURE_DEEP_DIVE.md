# RAG Architecture Deep Dive

> **Audience:** Technical Interviewer / Staff Engineer
> **Goal:** Demonstrate enterprise-grade RAG pipeline design with real implementation details

---

## Pipeline Philosophy

**"Enterprise SOTA" — Determinism & Speed over Graphs and Agents.**

This is not an experimental agent framework. It's a production compliance tool where:
- Every answer must be traceable to a source document
- Latency must stay under 2 seconds for streaming to feel instant
- The pipeline must degrade gracefully (Cohere down? Fall back to hybrid search scores)

The pipeline has **5 deterministic steps** — no loops, no self-reflection, no multi-agent orchestration. Each step has a single responsibility and a clear input/output contract.

---

## The 5-Step Pipeline

```
User Query
    │
    ▼
┌─────────────────────────┐
│ 1. Query Expansion       │  gpt-4o-mini rewrites query + extracts state
│    expandQuery()         │  app/api/chat/route.ts:77-105
└────────────┬────────────┘
             │  { expandedQuery, state }
             ▼
┌─────────────────────────┐
│ 2. Embedding            │  text-embedding-3-small → 1536-dim vector
│    embedQuery()         │  app/api/chat/route.ts:115-121
└────────────┬────────────┘
             │  number[1536]
             ▼
┌─────────────────────────┐
│ 3. Hybrid Search        │  Supabase RPC: pgvector cosine + BM25 + RRF
│    hybridSearch()       │  app/api/chat/route.ts:135-153
└────────────┬────────────┘
             │  Top 20 chunks (combined_score DESC)
             ▼
┌─────────────────────────┐
│ 4. Reranking            │  Cohere rerank-english-v3.0 (cross-encoder)
│    rerankChunks()       │  app/api/chat/route.ts:166-213
└────────────┬────────────┘
             │  Top 5 chunks (relevanceScore 0–1)
             ▼
┌─────────────────────────┐
│ 5. Generation           │  Strict "Compliance Officer" system prompt
│    streamText()         │  app/api/chat/route.ts:351-372
└─────────────────────────┘
             │
             ▼
   Streaming Response + Citation Metadata (data-sources part)
```

---

### Step 1: Query Expansion — `expandQuery()`

**File:** `app/api/chat/route.ts`, lines 77–105

```typescript
async function expandQuery(userMessage: string): Promise<QueryExpansionResult>
```

**What it does:** Uses `gpt-4o-mini` to rewrite the user's natural-language question into legal terminology and extract any U.S. state reference.

**Example:**
- Input: `"deceased parent claim in Florida"`
- Output: `{ expandedQuery: "heirship affidavit probate intestate succession Florida", state: "FL" }`

**Why it matters:** Users don't use legal terminology. "What's the limit?" needs to become "maximum value threshold for notary requirement" to hit the right vectors and keywords. The extracted state code feeds into the hybrid search as a metadata filter.

**Failure mode:** If JSON parsing fails, falls back to the original query unchanged.

---

### Step 2: Embedding — `embedQuery()`

**File:** `app/api/chat/route.ts`, lines 115–121

```typescript
async function embedQuery(query: string): Promise<number[]>
```

**Model:** OpenAI `text-embedding-3-small` (1536 dimensions)

**Why this model:** Same model used at ingestion time (`scripts/ingest.ts:199-207`). Embedding model consistency between ingestion and query is critical — mismatched models produce misaligned vector spaces and silently degrade recall.

---

### Step 3: Hybrid Search — `hybridSearch()`

**File:** `app/api/chat/route.ts`, lines 135–153
**SQL Function:** `scripts/setup_db.sql`, lines 82–156

```typescript
async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  state: string | null
): Promise<HybridSearchResult[]>
```

**The Supabase RPC call:**
```typescript
supabase.rpc('hybrid_search', {
  query_embedding: JSON.stringify(queryEmbedding),
  query_text: queryText,
  match_count: 20,
  filter_state: state   // Optional — from expandQuery()
})
```

**Inside the SQL function — three CTEs:**

**CTE 1: Semantic Search**
```sql
SELECT d.id, d.content, d.metadata,
       1 - (d.embedding <=> query_embedding) AS score
FROM documents d
WHERE (filter_state IS NULL OR d.metadata->>'state' = filter_state)
ORDER BY d.embedding <=> query_embedding
LIMIT match_count
```
- `<=>` = cosine distance operator (pgvector)
- `1 - distance` = cosine similarity
- Uses HNSW index for approximate nearest neighbor

**CTE 2: Keyword Search (BM25-style)**
```sql
SELECT d.id, d.content, d.metadata,
       ts_rank_cd(d.searchable_text, websearch_to_tsquery('english', query_text)) AS score
FROM documents d
WHERE d.searchable_text @@ websearch_to_tsquery('english', query_text)
ORDER BY score DESC
LIMIT match_count
```
- `searchable_text` = generated `tsvector` column (auto-computed from `content`)
- `websearch_to_tsquery` = handles quoted phrases and operators
- `ts_rank_cd` = cover density ranking (rewards proximity of matched terms)
- Uses GIN index on `searchable_text`

**CTE 3: Reciprocal Rank Fusion (RRF)**
```sql
(COALESCE(1.0 / (ROW_NUMBER() OVER (ORDER BY s.score DESC NULLS LAST) + 60), 0) +
 COALESCE(1.0 / (ROW_NUMBER() OVER (ORDER BY k.score DESC NULLS LAST) + 60), 0))
 AS combined_score
```
- **RRF Formula:** `1 / (rank + k)` where `k = 60`
- `FULL OUTER JOIN` ensures results from either search are included
- Constant `k = 60` is the standard value from the original RRF paper — prevents zero-division and normalizes contribution across heterogeneous scoring functions

**Why hybrid over pure semantic?** Keyword search catches exact terms like "Form 1099" or "Section 4.2" that vector similarity misses. Semantic search catches paraphrases that keyword search misses. RRF combines both without needing score calibration.

**Output:** Top 20 chunks with `semantic_score`, `keyword_score`, and `combined_score`.

---

### Step 4: Reranking — `rerankChunks()`

**File:** `app/api/chat/route.ts`, lines 166–213

```typescript
async function rerankChunks(
  userMessage: string,
  chunks: HybridSearchResult[]
): Promise<RankedSearchResult[]>
```

**API Call:**
```typescript
fetch('https://api.cohere.com/v2/rerank', {
  method: 'POST',
  headers: { Authorization: `Bearer ${COHERE_API_KEY}` },
  body: JSON.stringify({
    model: 'rerank-english-v3.0',
    query: userMessage,         // Original user query (not expanded)
    documents: chunks.map(c => c.content),
    top_n: 5                    // RERANK_TOP_N
  })
})
```

**Why rerank?** Hybrid search retrieves 20 candidates using fast but shallow signals (vector distance, term frequency). The cross-encoder processes each (query, document) pair together — full attention between query and document tokens — producing a much more accurate relevance score. This is the "retrieve many, select few" pattern.

**Why `top_n: 5`?** The generation model's context window and attention quality degrade with too many chunks. 5 high-relevance chunks produce better answers than 20 mixed-quality chunks.

**Graceful degradation:** If the Cohere API fails, the function returns the top 5 chunks from hybrid search with `relevanceScore: 0`. The pipeline continues — the user still gets an answer, just without cross-encoder reranking.

**Pre-filter:** Before reranking, chunks shorter than `MIN_CHUNK_LENGTH` (50 chars) are filtered out to remove noise like stray headers or page numbers.

---

### Step 5: Generation — Streaming with Citation Enforcement

**File:** `app/api/chat/route.ts`, lines 223–260 (system prompt), 351–372 (streaming)

**System Prompt (condensed):**
```
You are a Strict Compliance Officer for state unclaimed property law at GovRecover.

## Your Rules:
1. Answer ONLY using provided documents. Do NOT use outside knowledge.
2. If docs don't contain info, respond: "I cannot find this information..."
3. ALWAYS cite using format: [Source: {filename}, Page {page number}]
4. Cite multiple sources when applicable.
5. Be precise with legal requirements.
6. State if query is about unrepresented state.

## Source Documents:

[Document 1]
Source: FL_Claimant_Guide.pdf
State: FL
Page: 12
Section: Notary Requirements

{chunk content}
```

**Streaming Response:**
```typescript
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    // 1. Send citation metadata as custom data part FIRST
    writer.write({
      type: 'data-sources',
      data: sourcesData,     // Citation[] with rank, relevanceScore, content, source, page, state, section
    });

    // 2. Stream LLM tokens
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
    });
    writer.merge(result.toUIMessageStream());
  },
  onError: () => 'An error occurred while generating the response.'
});
return createUIMessageStreamResponse({ stream });
```

**Key design decision:** Citations are sent as a separate `data-sources` part in the stream, not parsed from the LLM output. The LLM generates inline `[Source: filename, Page X]` text for readability, but the *structured* citation data (with rank, relevance scores, full chunk content) comes from the pipeline metadata. This means the Glass Box panel works even if the LLM's inline citation format is slightly off.

---

## Database Schema

**File:** `scripts/setup_db.sql`

### `documents` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | `gen_random_uuid()` |
| `content` | `TEXT` | Chunk text (page markers stripped) |
| `metadata` | `JSONB` | `{ state, type, source, page, section, parent_section }` |
| `embedding` | `vector(1536)` | OpenAI `text-embedding-3-small` |
| `searchable_text` | `tsvector` | **Generated column** — `to_tsvector('english', content) STORED` |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` |

### 5 Indexes

| Index | Type | Column/Expression | Purpose |
|-------|------|-------------------|---------|
| `documents_embedding_idx` | **HNSW** | `embedding vector_cosine_ops` | Fast approximate nearest neighbor for semantic search |
| `documents_searchable_text_idx` | **GIN** | `searchable_text` | Full-text search (BM25-style keyword matching) |
| `documents_metadata_idx` | **GIN** | `metadata jsonb_path_ops` | Flexible JSONB containment queries |
| `documents_state_idx` | **BTree** | `metadata->>'state'` | Fast equality filter on state code |
| `documents_type_idx` | **BTree** | `metadata->>'type'` | Fast equality filter on document type |

**Why a generated `tsvector` column?** Postgres computes `to_tsvector('english', content)` once at INSERT time and stores it. Queries use the pre-computed vector instead of recomputing on every search. The GIN index on this column makes full-text search near-instant.

**Why HNSW over IVFFlat?** HNSW provides better recall at similar speed, especially for datasets under 1M rows. No need to retrain centroids when adding new documents.

---

## Ingestion Pipeline

**File:** `scripts/ingest.ts`
**Run:** `npm run ingest` (via `tsx scripts/ingest.ts`)

```
PDF files in ./data/
    │
    ▼
┌────────────────────────────┐
│ 1. LlamaParse              │  PDF → Markdown (preserves tables, headers)
│    parsePDFWithLlamaParse() │  scripts/ingest.ts:124-172
│    tier: 'cost_effective'  │  Timeout: 300s, Poll: 2s
└────────────┬───────────────┘
             │  Markdown with <!-- PAGE:N --> markers
             ▼
┌────────────────────────────┐
│ 2. State Extraction        │  Regex: /^([A-Z]{2})/
│    extractStateFromFilename│  "FL_Claimant_Guide.pdf" → "FL"
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│ 3. Markdown Chunking       │  LlamaIndex MarkdownNodeParser
│    markdownParser          │  Respects header hierarchy
│    .getNodesFromDocuments() │  Preserves section metadata
└────────────┬───────────────┘
             │  Nodes with page markers still embedded
             ▼
┌────────────────────────────┐
│ 4. Page Extraction         │  Regex: /<!-- PAGE:(\d+) -->/g
│    extractPageFromContent()│  Finds last marker in each chunk
│    stripPageMarkers()      │  Removes markers before storage
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│ 5. Embed + Upsert          │  text-embedding-3-small (1536 dims)
│    generateEmbedding()     │  Batch size: 10
│    upsertToSupabase()      │  Progress logged every 10 chunks
└────────────────────────────┘
```

**Why LlamaParse over pdf-parse?** Legal documents are full of tables, nested headers, and multi-column layouts. Generic PDF extractors produce garbled text. LlamaParse uses vision models to produce clean Markdown that preserves table structures — critical when a compliance answer depends on reading a row in a table correctly.

**Page marker embedding:** LlamaParse inserts `<!-- PAGE:N -->` markers in the Markdown output. These markers survive the chunking step, so each chunk knows which page it came from. The `extractPageFromContent()` function reads the last marker in each chunk, then `stripPageMarkers()` removes them before the text is embedded and stored. This gives us page-level citation without needing a separate page mapping table.

---

## Evaluation Strategy

### Golden Dataset Concept

A static JSON dataset of 10 hard questions designed to stress-test the pipeline:

| Question Type | Example | What It Tests |
|---------------|---------|---------------|
| **Negative Constraint** | "Is notarization required for a $500 claim in CA?" | Model must say NO — threshold is $1,000 |
| **Threshold Precision** | "What is the exact dollar threshold for notary in CA?" | Exact number extraction from tables |
| **Cross-State** | "Compare FL and CA notary requirements" | Multi-document retrieval and synthesis |
| **Unsupported State** | "What are the rules for TX?" | Model must say "I cannot find this information" |
| **Specific Form Reference** | "What form is required for intestate succession in FL?" | Keyword search for form numbers |

### Automated Judge

Each question maps to:
- **Ground-truth page number(s)** — the citation MUST reference these pages
- **Expected keywords** — the answer MUST contain these terms
- **Negative constraints** — the answer MUST NOT contain certain claims

The judge script hits the local API, parses the response, and deterministically verifies correctness — no LLM-as-judge subjectivity.

---

## "Gotcha" Question Defense

### "Why not GraphRAG?"

> "I evaluated graph-based approaches, but for this specific compliance use case, I prioritized **latency and determinism**. GraphRAG adds traversal overhead and introduces non-deterministic path selection. My pipeline — Hybrid Search with RRF fusion + Cohere cross-encoder reranking — achieves high accuracy with a linear, predictable execution path. The entire pipeline runs in under 2 seconds including streaming start. For a production compliance tool, I'd rather have a fast, auditable, deterministic pipeline than a flexible but opaque graph traversal."

### "How would you handle document updates?"

> "Upsert Pipeline. Each PDF gets metadata including the source filename and year. When the 2027 California manual comes in:
> 1. Hash the new PDF to detect changes
> 2. Delete all existing chunks `WHERE metadata->>'source' = 'CA_Manual_2026.pdf'`
> 3. Re-ingest with updated metadata (`year: 2027`)
>
> This prevents 'Ghost Knowledge' — stale chunks from old documents appearing in search results. The BTree index on `metadata->>'state'` makes the delete fast."

### "Why not just use ChatGPT?"

> "Three reasons:
> 1. **Security** — Claims data includes SSNs and claimant PII. We can't paste that into a public LLM. This system keeps all data in our Supabase instance; the LLM only sees document chunks, never claimant data.
> 2. **Auditability** — ChatGPT doesn't cite sources. Our Glass Box pattern provides page-level citations that can be used in regulatory appeals.
> 3. **Document-only retrieval** — The system prompt enforces 'Answer ONLY using provided documents.' ChatGPT would blend training data with document data, creating undetectable hallucinations in a legal context."

### "How do you prevent hallucinations?"

> "Defense in depth across three layers:
> 1. **System Prompt** — Strict 'Compliance Officer' persona with explicit rules: answer only from provided documents, cite every claim, say 'I cannot find this information' when unsure.
> 2. **Retrieval Quality** — Hybrid search + reranking ensures the model receives only highly relevant chunks. Garbage in, garbage out — better retrieval means fewer hallucination triggers.
> 3. **Glass Box UX** — Even with perfect prompting, I don't trust the model blindly. The `CitationPanel` component (`components/citation-panel.tsx`) shows the user the exact source text, ranked by relevance. The human operator verifies before acting. This is a compliance tool — the AI assists, the human decides."

### "What would you add next?"

> "Three things, in priority order:
> 1. **Evaluation Pipeline** — Expand the Golden Dataset to 50+ questions and run it in CI. Every pipeline change gets regression-tested against ground-truth citations.
> 2. **Conversation Memory** — Right now each query is stateless. Adding chat history context (with a sliding window) would let users ask follow-ups like 'What about Florida?' without restating the full question.
> 3. **User Auth + Role-Based Access** — Supabase already supports Row Level Security. Add roles so Claims Specialists see their assigned states and QA Analysts get a read-only audit view."
