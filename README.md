# Quizzler

Production-grade RAG (Retrieval-Augmented Generation) system that turns unstructured documents into an interactive AI tutor with verifiable citations.

Upload lecture notes, textbooks, or study guides — Quizzler generates a quiz, then answers follow-up questions grounded strictly in your materials. Every claim includes source citations so you can verify and dig deeper.

**Built to demonstrate:** Multi-API orchestration, prompt engineering, hallucination mitigation, and production AI observability.

## Architecture

Quizzler uses a 5-stage Retrieval-Augmented Generation (RAG) pipeline to deliver accurate, cited answers from your uploaded documents.

### Pipeline Overview

```
User Question
     │
     ▼
┌─────────────────────┐
│ 1. Query Expansion  │  Rewrites your question with academic terminology (GPT-4o-mini)
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 2. Embedding        │  Converts expanded query to a dense vector (text-embedding-3-small)
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 3. Hybrid Search    │  Vector + keyword search via Supabase pgvector (RRF fusion, top 20)
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 4. Cohere Rerank    │  Precision reranking with Cohere Rerank v3 (top 5)
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 5. Generation       │  GPT-4o-mini streams a cited answer from the top chunks
└─────────────────────┘
```

### Stage Details

1. **Query Expansion** — A lightweight LLM call rewrites the student's question using precise academic vocabulary, improving retrieval recall.
2. **Embedding** — The expanded query is embedded with `text-embedding-3-small` (1536 dims) to match the vectors stored during document ingestion.
3. **Hybrid Search** — A Supabase RPC function combines dense vector search (cosine similarity) with keyword search (BM25-style full-text via tsvector), merged via Reciprocal Rank Fusion.
4. **Cohere Rerank** — The top 20 hybrid results are reranked using Cohere's `rerank-english-v3.0` model against the *original* user question, selecting the top 5 most relevant chunks.
5. **Generation** — GPT-4o-mini streams a response grounded strictly in the retrieved chunks, with inline source citations.

## Prompt Engineering

Quizzler implements production-grade prompt management practices:

- **Externalized Prompts** — All LLM prompts live in version-controlled `.md` files under `prompts/`, never hard-coded in application logic
- **Prompt Templates** — Dynamic placeholders (`{chunks}`, `{quiz}`, `{score}`) enable reusable, context-aware prompts
- **Multi-Stage Prompting** — Different specialized prompts for query expansion, quiz generation, and tutoring ensure optimal performance per task
- **Iterative Refinement** — Prompts are treated as first-class code artifacts with version control and A/B testing via LangSmith traces

This separation enables rapid iteration on prompt quality without touching application code—critical for production AI systems.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **AI SDK**: Vercel AI SDK
- **LLM Orchestration**: Coordinates 3 AI providers in a single pipeline:
  - **OpenAI** — Embeddings (text-embedding-3-small) + Generation (GPT-4o-mini)
  - **Cohere** — Semantic reranking (rerank-english-v3.0)
  - **LlamaParse** — PDF document parsing
- **Vector DB**: Supabase with pgvector / In-memory cosine similarity
- **Observability**: LangSmith end-to-end tracing
- **Styling**: Tailwind CSS

## Key Design Decisions

### Why 5 Stages?
- **Query Expansion** — Addresses vocabulary mismatch between student questions and academic text
- **Hybrid Search** — Combines semantic similarity (vectors) with keyword matching (BM25) for better recall
- **Two-Stage Retrieval** — Cast a wide net (top 20), then precision-rank (top 5) to balance recall and precision
- **Strict Grounding** — LLM only sees top 5 chunks, reducing hallucination surface area

### Production Trade-offs
- In-memory vector search over managed DB for <200 chunks (sub-millisecond, no infrastructure)
- Streaming responses for perceived performance (first token in ~500ms)
- LangSmith tracing on every request for production debugging
- Ephemeral sessions (no auth/DB) prioritizing privacy over persistence

## Getting Started

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in your API keys:
   ```
   OPENAI_API_KEY=
   COHERE_API_KEY=
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

3. Run the dev server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and start asking questions about your study materials.

## Observability

Every RAG pipeline run is traced end-to-end via [LangSmith](https://smith.langchain.com/). Each request produces a parent trace named `rag_pipeline` containing child spans for every stage:

| Span | What it captures |
|---|---|
| `expand_query` | Input question, expanded query output |
| `embed_query` | Query text in, embedding vector out |
| `hybrid_search` | Query embedding + text in, matched chunks out |
| `cohere_rerank` | Cohere relevance scores per chunk |
| `gpt-4o-mini` (via `wrapAISDKModel`) | Prompt, completion, token usage |

### Setup

Add these to your `.env.local`:

```
LANGSMITH_TRACING_V2=true
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_PROJECT=quizzler
```

Traces appear automatically in your [LangSmith dashboard](https://smith.langchain.com/) under the `quizzler` project.

## Evaluation & Testing

Quizzler includes a production-ready evaluation framework to ensure AI output quality and safety.

### Latest Test Results

Automated evaluation against 10 test questions (8 on-topic biology questions, 2 off-topic control questions):

| Metric | Score | Details |
|--------|-------|---------|
| **Citation Accuracy** | 9/10 (90%) | Every answered question includes numbered source citations `[1]`, `[2]` |
| **Hallucination Detection** | 9/10 (90%) | Correctly refuses off-topic questions (cookie recipes, sports trivia) |
| **Average Latency** | 4.9s | Full pipeline: query expansion → embedding → search → rerank → generation |
| **Overall Pass Rate** | 9/10 (90%) | Both citation and hallucination checks passing |

### Automated Test Suite

The eval script (`npm run eval`) validates the RAG pipeline against a golden dataset with:

- **Groundedness Validation** — Verifies every answer includes proper numbered citations `[1]`, `[2]` from retrieved chunks
- **Hallucination Detection** — Tests the model's ability to refuse off-topic questions instead of fabricating answers
- **Latency Benchmarking** — Tracks end-to-end response times to catch performance regressions
- **CI Integration** — Exits with non-zero code on failure, suitable for automated testing pipelines

### Safety Guardrails

- Fallback responses when retrieval confidence is low ("I couldn't find that in your study materials")
- Numbered source citations for every claim to enable human verification
- Rejection of queries outside the uploaded document scope

This testing approach ensures reliable AI behavior in production, catching edge cases before they reach users.

### Running evals

Start the dev server, then run:

```bash
npm run eval
```

The script outputs a summary table and an overall pass/fail score.
