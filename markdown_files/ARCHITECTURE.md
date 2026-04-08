# ARCHITECTURE.md
**Project:** GovCite
**Subtitle:** The Deterministic Compliance Engine for Multi-Jurisdictional Asset Recovery.
**Version:** 1.1 (SOTA Interview Demo)

---

## 1. Project Goal & Business Value
**GovCite** is a "Glass Box" RAG engine designed to solve the critical bottleneck of asset recovery: **State-Specific Variance**.

Every state has different statutes for claiming property (e.g., Florida requires a notarized affidavit for heirs; California requires a Controller affirmation). Standard LLMs hallucinate these details or mix up state laws.

**GovCite solves this by:**
1.  **Ingesting State Manuals:** Parses complex claimant guide PDFs, preserving the "Parent-Child" relationship between legal sections.
2.  **Hybrid Retrieval:** Finds specific form numbers (via Keyword Search) while understanding legal intent (via Semantic Search).
3.  **Strict Citation:** Refuses to answer unless it can cite the specific page and section of the state statute, creating an audit trail for GovRecover's operations team.

---

## 2. System Architecture

### Pipeline A: The "Write" Path (Ingestion)
*Status: Offline Script (`scripts/ingest.ts`)*

1.  **Raw Ingestion (LlamaParse):**
    * **Tool:** `LlamaParseReader` (LlamaIndex).
    * **Logic:** Extracts text as **Markdown**, preserving headers, tables, and section hierarchy (critical for "Glass Box" retrieval).
2.  **Chunking & Enrichment:**
    * **Strategy:** Markdown Node Parser (respects headers).
    * **Metadata:** Tags every chunk with `{ state: "FL", type: "guide", source: "filename" }`.
3.  **Embedding (Hybrid):**
    * **Dense:** OpenAI `text-embedding-3-small` (for semantic meaning).
    * **Sparse/Keyword:** Generates searchable lexemes (via `tsvector` or Sparse Embeddings) for precise keyword matching.
    * **Storage:** Supabase (Postgres) using `pgvector`.

### Pipeline B: The "Read" Path (Real-Time Retrieval)
*Status: Online API Route (`app/api/chat/route.ts`)*

1.  **User Input:** "What are the affidavit requirements for a deceased parent claim in Florida?"
2.  **Query Expansion (Agentic Step):**
    * **Logic:** An LLM call rewrites the user query to include specific legal terms (e.g., "deceased parent" -> "heirship affidavit probate").
    * **Routing:** Filters database query strictly by `metadata.state`.
3.  **Hybrid Search (Supabase):**
    * **Dense Search:** Cosine Similarity on vectors.
    * **Keyword Search:** BM25 or Postgres Full-Text Search (`websearch_to_tsquery`) on text content.
    * **Fusion:** Merges results (RRF or weighted sum) to retrieve Top 20 candidates.
4.  **Re-Ranking (The Precision Layer):**
    * **Tool:** Cohere Rerank API.
    * **Logic:** Scores the Top 20 candidates by relevance to the *original* user question.
    * **Filter:** Keeps only the **Top 5** chunks.
5.  **Generative Reasoning:**
    * **Model:** GPT-4o-mini.
    * **System Prompt:** "You are a strict compliance officer. Answer ONLY using the provided context. Cite your sources."
6.  **Streaming Response:**
    * Streams token-by-token to the frontend via Vercel AI SDK.

---

## 3. Tech Stack (The "Reclaim-Native" Stack)

| Component | Technology | Reasoning |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 14 (App Router)** | Industry standard; matches Reclaim.org stack. |
| **Language** | **TypeScript** | End-to-end type safety; reduces runtime errors. |
| **UI Library** | **Shadcn/UI + Tailwind** | Rapid development of professional "Trust" UI. |
| **Streaming** | **Vercel AI SDK (Core)** | Handles complex streaming state management. |
| **Backend** | **Next.js API Routes** | Serverless architecture; scales to zero. |
| **Database** | **Supabase (Postgres)** | Unified data & vector store; prevents data sync issues. |
| **Vector Ext** | **pgvector** | Native vector search within Postgres. |
| **RAG Logic** | **LlamaIndexTS** | TypeScript RAG framework for Hybrid Search. |
| **Re-Ranking** | **Cohere** | Industry SOTA for retrieval precision. |

---

## 4. Key Constraints for Development (Vibe Coding Rules)
* **No Auth:** Hardcode the user for the demo.
* **No File Upload UI:** Ingest PDFs via script only.
* **Strict Types:** Define `interface Citation` shared between Frontend and Backend.
* **Citations UI:** The frontend must ALWAYS display a side panel for "Source Documents" when a citation is clicked.