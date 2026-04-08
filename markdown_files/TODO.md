# Project Execution Plan

## Phase 1: Infrastructure & Data (Hour 0-1)
- [x] Initialize Next.js 14 (App Router) + Tailwind + Shadcn/UI.
- [x] Set up Supabase Client (`lib/supabase.ts`) with environment variables.
- [x] Create `documents` table SQL snippet (**Enable `pgvector` AND `pg_search` or Hybrid logic**).
- [x] Create `scripts/ingest.ts`:
    - [x] Load PDFs from `data/`.
    - [x] **Configure `LlamaParseReader` to extract markdown with headers.**
    - [x] Generate Dense Embeddings (`text-embedding-3-small`).
    - [x] **Generate Sparse Embeddings (or prepare metadata for Hybrid Search).**
    - [x] Upsert to Supabase.
- [x] **Milestone:** Verify data exists in Supabase Dashboard.

## Phase 2: The RAG Backend (Hour 1-2)
- [x] Create `app/api/chat/route.ts`.
- [x] **Implement Query Expansion:**
    - [x] **Add LLM step to rewrite user query for legal precision.**
- [x] Implement Hybrid Search Logic:
    - [x] **Execute Keyword Search (BM25 or similar).**
    - [x] Execute Vector Search (Cosine similarity).
    - [x] **Combine results (RRF or simple merger).**
- [x] Implement Re-Ranking:
    - [x] Integrate Cohere Rerank API.
    - [x] Select Top 5 chunks.
- [x] Implement Streaming Response:
    - [x] Use Vercel AI SDK `streamText`.
    - [x] Inject retrieved chunks into System Prompt.
- [x] **Milestone:** Verify JSON response via CURL/Postman.

## Phase 3: The Frontend Experience (Hour 2-3)
- [x] Create `components/chat-interface.tsx`:
    - [x] Use `useChat` hook for state management.
    - [x] Render User/AI messages bubbles.
- [x] Create `components/citation-panel.tsx`:
    - [x] Sidebar that displays source text when a citation is clicked.
- [x] **Milestone:** Verify full chat loop in browser.

## Phase 4: Polish & Demo Prep (Hour 3-4)
- [x] Styling: Apply "GovCite" branding (Blue/White, Clean).
- [x] Citations: Ensure `[Source: FL Guide]` appears next to answers.
- [ ] Hardcode "User Context": Simulate a specific user (e.g., "Operations Manager").