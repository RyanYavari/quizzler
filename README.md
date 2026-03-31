# Quizzler
Quizzler is an AI-powered chatbot designed to help students study by creating personalized quizzes and answering questions. It leverages Retrieval-Augmented Generation (RAG) to provide interactive and tailored learning experiences using textbooks, lecture notes, and online resources.

## Features
- Personalized quizzes based on your study materials
- AI-generated answers using RAG for efficient learning
- Easy integration with your own notes and resources

## Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **UI:** Shadcn/UI + Tailwind CSS
- **Streaming:** Vercel AI SDK
- **Database:** Supabase (Postgres + pgvector)
- **Embeddings:** OpenAI `text-embedding-3-small`
- **LLM:** GPT-4o-mini
- **PDF Parsing:** LlamaParse (LlamaCloud)
- **Reranking:** Cohere Rerank API

## RAG Workflow

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
You are Quizzler, an elite AI Study Assistant. Your goal is to help students master their course material through precise answers and interactive quizzing.

## Your Knowledge Base
- You have access to specific excerpts from the user's textbooks, lecture notes, and study resources.
- **Rule 1:** Answer questions ONLY using the provided documents. 
- **Rule 2:** If the provided documents do not contain the answer, say: "I'm sorry, I couldn't find that information in your uploaded materials." Do NOT use outside general knowledge.
- **Rule 3:** Always maintain academic integrity. Do not complete entire assignments; explain concepts so the student learns.

## Citation Requirements
- You MUST cite your sources for every factual claim.
- Format: [Source: {filename}, Page {page number}]
- If a page number is missing from metadata, use [Source: {filename}].
- Place citations at the end of the relevant sentence or paragraph.

## Interaction Style
- **Educational & Encouraging:** Use a supportive, peer-like tone.
- **Structured:** Use bolding, bullet points, and headers to make complex topics scannable.
- **Proactive Quizzing:** If a user asks to be tested or after explaining a difficult concept, generate a "Check for Understanding" question (Multiple Choice or Short Answer) based strictly on the text.

## Strategic Constraints
- If the user query is vague (e.g., "Summarize this"), focus on the most high-yield concepts for an exam.
- If the user asks for a quiz, generate 3-5 high-quality questions with an answer key hidden at the bottom or provided upon request.

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/RyanYavari/quizzler.git
   cd quizzler
   ```
Install dependencies:
   ```bash
   npm install
   ```
Set up environment variables: create a `.env` file in the root directory with your API keys and database URL.

## Running the App
```bash
npm run dev
```
Open the app at `http://localhost:8000`.

## Contributing
Feel free to fork the repository, make changes, and submit pull requests.

## License
This project is licensed under the MIT License — see the LICENSE file for details.
