# GovRecover Compliance Engine — Project Overview

> **Audience:** Founder / CTO / Hiring Manager
> **Goal:** Communicate business value, product thinking, and full-stack engineering depth

---

## Elevator Pitch

**"I didn't build a customer-support chatbot. I built an Internal Compliance Engine for the Operations Team."**

GovRecover's core problem is **State Variance** — every U.S. state publishes its own unclaimed-property manual with different rules, thresholds, forms, and deadlines. A claims specialist working a Florida case follows completely different procedures than a California case.

Today, operators manually search 200+ page PDFs for answers. One wrong threshold, one missed notary rule, and the claim gets rejected — costing weeks of rework and regulatory risk.

GovRecover Compliance Engine turns a **15-minute PDF search into a 20-second query** with source-cited answers that can be audited and used in appeals.

---

## User Personas

### Sarah — Claims Specialist
> "I'm working a $52,000 estate claim in California. I usually handle Florida cases, so I need to check the notary requirement before filing."

Sarah types: *"What is the notary threshold for a deceased owner claim in CA?"*

The system answers with the exact threshold, citing `CA_Manual.pdf, Page 1`, and she clicks the citation badge to verify the source text in a side panel — without ever opening the PDF.

**Impact:** Sarah files correctly on the first attempt. No rejection. No rework.

### QA Analyst
> "I need to audit 30 outbound claims before they're mailed. Each one references a different state's 2026 statutes."

The QA analyst queries each state's rules and uses the Glass Box citation panel to verify that every claim matches the source documentation — creating an auditable compliance trail.

**Impact:** Audit time drops from hours to minutes. Every decision is traceable to a specific page in a specific manual.

---

## Business Value

| Metric | Before | After |
|--------|--------|-------|
| **Velocity** | 15 min per lookup (manual PDF search) | 20 sec per query (instant, cited answer) |
| **Risk Reduction** | Tribal knowledge, no paper trail | Glass Box citations for appeals and audits |
| **Privacy** | Staff paste PII into public ChatGPT | API-only integration — no data leaves the org, no model training on proprietary docs |

---

## The "Trojan Horse" Strategy

> **The meta-goal:** Every RAG question is an opening to demonstrate General Software Engineering depth.

This project is a vehicle to demonstrate full-stack engineering across databases, frontend architecture, and product/UX — not just AI/ML knowledge.

### Pivot Table

| When They Ask About... | Pivot To... | Talk Track |
|------------------------|-------------|------------|
| **Vectors & Embeddings** | **Database Design** | "I chose Postgres via Supabase over a niche vector DB because I needed a relational schema with ACID compliance to handle auth, chat history, and vectors in one production-ready database. The `documents` table uses a `vector(1536)` column with an HNSW index, a generated `tsvector` column with a GIN index for full-text search, and JSONB metadata with `jsonb_path_ops` for flexible filtering — all in one table with 5 purpose-built indexes." |
| **Prompting & LLMs** | **Frontend Architecture** | "The real challenge wasn't the prompt — it was the React streaming architecture. I use Vercel AI SDK's `useChat` hook with `DefaultChatTransport` to stream tokens in real-time, then `createUIMessageStream` on the backend to merge the LLM stream with a custom `data-sources` part that carries citation metadata. On the frontend, a regex parser (`/\[Source:\s*(.+?),\s*Page\s*(.+?)\]/g`) converts inline citation text into clickable `Badge` components — all while maintaining hydration-safe rendering." |
| **Hallucinations** | **Product/UX Engineering** | "I solved this at the UX layer with a 'Glass Box' pattern. The `CitationPanel` component renders a Radix `Sheet` side-panel showing ranked source chunks with relevance scores, metadata badges, and a `Dialog`-based PDF viewer modal. The user never trusts the model blindly — they click a citation badge, the side panel slides out, and they verify the exact source text. It's a compliance tool, not a creative bot." |

### Key Engineering Highlights Behind Each Pivot

**Database Design (Postgres/Supabase):**
- Single database for auth + vectors + chat history + document metadata
- `documents` table: `scripts/setup_db.sql`
- 5 indexes: HNSW vector (`vector_cosine_ops`), GIN full-text (`searchable_text`), GIN metadata (`jsonb_path_ops`), BTree state, BTree type
- Custom `hybrid_search()` RPC function combining cosine similarity + `ts_rank_cd()` BM25 + Reciprocal Rank Fusion

**Frontend Architecture (React + Vercel AI SDK):**
- `components/chat-interface.tsx` — Streaming chat with `useChat` hook
- `components/citation-panel.tsx` — Glass Box side panel with PDF viewer
- `app/page.tsx` — State management lifting citations between chat and panel
- Citation badge regex parsing inline with message rendering
- `useEffect` extracts `data-sources` custom parts from streamed messages

**Product/UX Engineering (Glass Box Pattern):**
- `CitationPanel` — Radix `Sheet` (right-side slide-out, `sm:max-w-lg`)
- Source chunks sorted by reranker rank, each showing:
  - Rank indicator (`#1`, `#2`, etc.)
  - Relevance score badge (Cohere score as percentage)
  - State and page metadata badges
  - Full chunk text in a `<pre>` block
  - Clickable PDF link → opens `Dialog` modal with `<iframe>` viewer
- Active citation auto-scrolls with `scrollIntoView({ behavior: 'smooth' })`
- PDF served via `app/api/pdf/route.ts` with path traversal protection

---

## Tech Stack at a Glance

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 14 | Full-stack React with API routes |
| Streaming | Vercel AI SDK (`ai@^6.0.72`) | `useChat`, `streamText`, `createUIMessageStream` |
| LLM | OpenAI `gpt-4o-mini` | Query expansion + response generation |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) | Semantic search vectors |
| Database | Supabase (Postgres + pgvector) | Vectors, full-text, metadata, auth |
| PDF Parsing | LlamaParse (`@llamaindex/llama-cloud@^1.4.0`) | Table-aware markdown extraction |
| Reranking | Cohere `rerank-english-v3.0` | Cross-encoder relevance scoring |
| UI Components | Radix UI + Tailwind + Lucide icons | Sheet, Dialog, Badge, ScrollArea |
