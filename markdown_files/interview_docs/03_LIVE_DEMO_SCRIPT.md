# Live Demo Script

> **Audience:** Live call — interviewer watching your screen
> **Format:** Screenplay with stage directions
> **Duration:** 3–5 minutes (expandable to 10 with Q&A)

---

## Pre-Demo Checklist

- [ ] `npm run dev` is running — verify `http://localhost:3000` loads
- [ ] Browser open to `localhost:3000` — GovRecover Compliance Engine header visible
- [ ] DevTools Network tab open (hidden, ready to show if asked about streaming)
- [ ] Terminal visible in a split pane (for showing `scripts/ingest.ts` or `app/api/chat/route.ts` if asked)
- [ ] Supabase dashboard tab open (for showing `documents` table if asked)
- [ ] `.env` file has valid keys for OpenAI, Cohere, Supabase, LlamaParse
- [ ] Test query works: type "notary threshold CA" and confirm you get a cited answer
- [ ] Clear chat history before the call starts (refresh the page)

---

## The Demo

### Act 1: The Setup (30 seconds)

| Step | Action | Dialogue | Screen |
|------|--------|----------|--------|
| 1 | Gesture to the app | "Let me show you what I built. This is GovRecover's Compliance Engine — an internal tool for the operations team." | Landing page visible: header reads **GovRecover Compliance Engine**, subtitle reads **Deterministic RAG for State Unclaimed Property Law** |
| 2 | Pause for context | "The core problem is **State Variance**. Every U.S. state has different rules for unclaimed property — different thresholds, different forms, different notary requirements. Today, claims specialists manually search through 200-page PDFs to find the answer." | Same screen — let it breathe |
| 3 | Set up the persona | "Let's simulate **Sarah**, a Claims Specialist. She usually handles Florida cases, but today she's working a $52,000 estate claim in **California** and needs to check the notary rule before filing." | Same screen — cursor moves to input field |

---

### Act 2: The Query (30 seconds)

| Step | Action | Dialogue | Screen |
|------|--------|----------|--------|
| 4 | Type slowly and deliberately | *Type:* `What is the notary threshold for a deceased owner claim in CA?` | Query appears in the input field |
| 5 | Hit Enter | "Watch the streaming response." | Message appears in chat. Tokens stream in real-time. |
| 6 | Let the response finish | "It found the answer — and notice the **citation badges** inline in the response." | Response visible with `[Source: CA_Manual.pdf, Page 1]` rendered as a clickable badge with a scale icon |
| 7 | Point out the citation | "Each badge links to the exact source document and page number. This isn't the model's opinion — it's pulled directly from California's official manual." | Highlight the badge visually with cursor |

---

### Act 3: The Glass Box Reveal (60 seconds)

| Step | Action | Dialogue | Screen |
|------|--------|----------|--------|
| 8 | Click the citation badge | "Now here's the key design decision — the **Glass Box** pattern." | Side panel (`Sheet`) slides in from the right |
| 9 | Gesture to the panel | "This panel shows every source chunk the model used to generate that answer, ranked by relevance. Chunk #1 has the highest Cohere reranker score." | `CitationPanel` visible showing ranked chunks with `#1`, `#2` badges and relevance score percentages |
| 10 | Point to metadata | "Each chunk shows the state, page number, and section name. Sarah can verify the exact text the model cited." | Metadata badges visible: state badge, page badge, section badge |
| 11 | Point to the active chunk | "The chunk I clicked is highlighted — it auto-scrolled here so I don't have to hunt for it." | Active chunk highlighted with left blue border (`border-l-primary`) and light background |
| 12 | Click "View PDF" button | "And if she needs even more context, she can open the original PDF." | `Dialog` modal opens with an `<iframe>` rendering the full PDF |
| 13 | Close the modal and panel | "So the model assists, but **Sarah decides**. That's critical for compliance — you need an audit trail, not a black box." | Back to the chat view |

---

### Act 4: The Close (30 seconds)

| Step | Action | Dialogue | Screen |
|------|--------|----------|--------|
| 14 | Lean back from screen | "That's the product layer. Under the hood, this is a 5-step pipeline: query expansion with GPT-4o-mini, hybrid search combining pgvector cosine similarity with Postgres full-text BM25, Reciprocal Rank Fusion, Cohere cross-encoder reranking, then streaming generation with citation enforcement." | Chat still visible |
| 15 | Pause | "I'm happy to go deeper on any layer — the database design, the frontend streaming architecture, or the retrieval pipeline." | Maintain eye contact, stop sharing if video call |
| 16 | Invite questions | "What would you like to dig into?" | — |

---

## Recovery Scripts

### If the app doesn't load

> "Looks like the dev server needs a moment — let me restart it. While that spins up, let me walk you through the architecture. The app is Next.js 14 with the RAG pipeline running server-side in an API route at `app/api/chat/route.ts`..."

*Action:* Switch to terminal, run `npm run dev`, continue talking about architecture until it's ready.

---

### If the response is slow or times out

> "The latency here is because we're hitting three external APIs sequentially — OpenAI for query expansion and embedding, Supabase for hybrid search, then Cohere for reranking. In production, I'd parallelize the embedding and expansion calls since they're independent. Let me try again..."

*Action:* Refresh and retry. If still slow, show the code in `app/api/chat/route.ts` and walk through the pipeline steps verbally.

---

### If the response doesn't include citations

> "Interesting — the model didn't include inline citations this time. That actually highlights why I built the Glass Box panel as a separate data channel. The citation metadata is sent independently of the LLM text as a custom `data-sources` stream part, so even if the model's text formatting is off, the side panel still has the full source data. Let me click here..."

*Action:* Open the `CitationPanel` to show that the sources are still available in the side panel regardless of inline citation rendering.

---

### If they ask to see the code

> "Sure — let me show you the pipeline."

*Action:* Open `app/api/chat/route.ts`. Scroll to:
- `expandQuery()` (line 77) — "This rewrites the query into legal terminology"
- `hybridSearch()` (line 135) — "This calls a Supabase RPC function that does cosine similarity and BM25 in one SQL query with RRF fusion"
- `rerankChunks()` (line 166) — "Cohere cross-encoder rescores the top 20 down to 5"
- `buildSystemPrompt()` (line 223) — "This assembles the context window with strict compliance rules"

---

### If they ask about the database

> "It's all Postgres via Supabase — one table, five indexes."

*Action:* Open `scripts/setup_db.sql`. Show:
- The `documents` table with `vector(1536)` and generated `tsvector` columns
- The `hybrid_search` function — walk through the three CTEs (semantic, keyword, RRF)
- The HNSW index for vectors and GIN index for full-text

---

### If they ask about testing

> "I built a Golden Dataset approach — 10 hard questions with ground-truth page numbers and negative constraints. An automated judge script hits the API and deterministically verifies that the response cites the correct pages. No LLM-as-judge subjectivity. For a production deploy, I'd run this in CI so every pipeline change gets regression-tested."

---

## Demo Query Alternatives

If you want to vary the demo or the primary query doesn't produce great results, have backups:

| Query | What It Shows |
|-------|--------------|
| `What is the notary threshold for a deceased owner claim in CA?` | Primary — threshold precision, single-state citation |
| `What forms are required for filing in Florida?` | Form-number retrieval — tests keyword search for specific form references |
| `Compare the requirements for CA and FL claims` | Multi-document retrieval — tests cross-state synthesis |
| `What are the rules for claims in Texas?` | Negative test — system should say "I cannot find this information" since TX isn't in the corpus |
