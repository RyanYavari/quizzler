# Quizzler

AI-powered study assistant that lets students upload course materials and ask questions with cited answers.

Upload your lecture notes, textbooks, and study guides — then ask Quizzler anything. Every answer is grounded in your materials with precise source citations so you can verify and dig deeper.

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

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **AI SDK**: Vercel AI SDK
- **Vector DB**: Supabase with pgvector
- **Embeddings**: OpenAI text-embedding-3-small
- **Reranking**: Cohere Rerank v3
- **Generation**: GPT-4o-mini
- **Styling**: Tailwind CSS

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

## Evaluation

A built-in eval script tests the RAG pipeline against a golden dataset of 10 study-focused questions.

### What it checks

- **Citation present** — Does the response include a `[Source: ...]` citation?
- **Hallucination detection** — Does the model refuse to answer off-topic questions instead of hallucinating?
- **Latency** — End-to-end response time per question.

### Running evals

Start the dev server, then run:

```bash
npm run eval
```

The script outputs a summary table and an overall pass/fail score. It exits with code 1 if any test fails, making it suitable for CI.
