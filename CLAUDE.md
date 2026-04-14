# CLAUDE.md — Quizzler RAG Tutor

## What We're Building
Quiz-first study tool. User uploads content → AI generates MCQ quiz → user takes quiz → score reveal → RAG tutor reviews with cited answers from uploaded material ("glass box" citations). 5-stage RAG pipeline preserved, using in-memory vector search instead of Supabase.

---

## Tech Stack
- Next.js 14 App Router + TypeScript
- Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/react`)
- GPT-4o-mini — quiz generation, query expansion, tutor generation
- OpenAI `text-embedding-3-small` — embeddings
- Cohere `rerank-english-v3.0` — reranking
- In-memory server-side Map — ephemeral session store, 2hr TTL, no database
- LlamaParse cloud API — PDF parsing
- LangSmith — tracing (`langsmith/traceable`, `langsmith/wrappers/vercel`)
- Tailwind CSS
- **No new dependencies** — all functionality uses existing packages

---

## Prompts Convention
**All LLM prompts live in `prompts/` as `.md` or `.txt` files. Never inline prompt strings in implementation files.**

```
prompts/
  query-expansion.md     # expandQuery system prompt
  quiz-generator.md      # generateQuiz system prompt (includes {n} placeholder)
  tutor-system.md        # tutor system prompt (includes {chunks}, {quiz}, {score} placeholders)
```

Each module imports its prompt: `const prompt = fs.readFileSync('prompts/tutor-system.md', 'utf-8')`
Then interpolates placeholders before passing to the LLM.

---

## App Flow
| Stage | Screen | What Happens |
|---|---|---|
| 1 | Upload | PDF / .txt / paste text (≤10k chars) + pick question count (5/10/15/20, default 10) |
| 2 | Loading | SSE spinner: `parsing → chunking → processing → complete`. Parallel: embed chunks + generate quiz |
| 3 | Quiz | All N questions at once, 4 radio choices each. Tutor locked. Client-side scoring on submit. |
| 4 | Review | Score reveal + 70/30 split. Tutor sends one proactive message, then reactive RAG chat. |

---

## API Routes

### `POST /api/upload`
Accepts `FormData (file + questionCount)` or `JSON { text, questionCount }`. Streams SSE.
1. Parse (LlamaParse for PDF, `.text()` for TXT, passthrough for pasted text)
2. Chunk recursively (~500 chars, 50 overlap)
3. Parallel: `embedMany(chunks)` + `generateQuiz(content, n)` (prompt from `prompts/quiz-generator.md`)
4. `sessionStore.set(sessionId, { chunks, quiz, fileName })`
5. Return `{ sessionId, quiz, metadata }`

### `POST /api/tutor`
Accepts `{ sessionId, messages: UIMessage[] }`. Looks up session, runs 5-stage pipeline, streams via `createUIMessageStreamResponse`.

**5-stage RAG pipeline** (all steps traced):
1. `expand_query` — academic query rewrite via `prompts/query-expansion.md`
2. `embed_query` — `text-embedding-3-small`
3. `in_memory_search` — cosine similarity, top 20
4. `cohere_rerank` — top 20 → top 5, capture scores
5. `generate` — stream via `wrapAISDKModel(openai('gpt-4o-mini'))`, system prompt from `prompts/tutor-system.md` with top 5 chunks + full quiz context + user answers + score injected

Tutor fallback: "I couldn't find that in your study materials."
Citation format: `[Source: {filename}, Page {page}]`

---

## File Structure
```
prompts/
  query-expansion.md / quiz-generator.md / tutor-system.md

app/
  page.tsx                    # Screen state machine (upload|loading|quiz|review)
  globals.css                 # Spinner + score reveal animations
  api/
    upload/route.ts           # SSE upload + parallel processing
    tutor/route.ts            # 5-stage RAG tutor endpoint

components/
  upload-screen.tsx           # Dropzone + textarea + question count picker
  loading-screen.tsx          # SSE progress spinner
  quiz-screen.tsx             # Full-width quiz
  quiz-question.tsx           # Single MCQ card
  review-screen.tsx           # 70/30 split orchestrator
  score-reveal.tsx            # Animated score banner
  quiz-review.tsx             # Left: scrollable answered quiz
  review-question.tsx         # Correct/incorrect highlighted card
  tutor-chat.tsx              # Right: useChat + streaming + citations
  citation-block.tsx          # Inline glass box citation

lib/
  types.ts                    # All shared types
  rag-pipeline.ts             # tracedModel, expandQuery, embedQuery, embedBatch, rerankChunks
  in-memory-search.ts         # cosineSimilarity + inMemorySearch (traceable retriever)
  session-store.ts            # Map<string,Session> singleton, 2hr TTL
  chunker.ts                  # Recursive text splitter
  quiz-generator.ts           # generateQuiz (traceable)
  parse-upload.ts             # parseUpload(req) → { text, fileName }
  supabase.ts                 # Kept, unused
```
**Removed**: `app/api/chat/`, `app/api/pdf/`, `components/chat-interface.tsx`, `components/citation-panel.tsx`

---

## Key Types
```typescript
type AppScreen = 'upload' | 'loading' | 'quiz' | 'review';

interface QuizQuestion { id: string; question: string; options: [string,string,string,string]; correctIndex: number; explanation: string; }
interface SessionChunk  { id: string; content: string; embedding: number[]; metadata: { source: string; chunkIndex: number; page?: number }; }
interface Session       { id: string; chunks: SessionChunk[]; quiz: QuizQuestion[]; fileName: string; createdAt: number; }
interface QuizResult    { userAnswers: Record<string, number>; score: number; total: number; }
interface Citation      { content: string; source: string; page: number | null; chunkIndex: number; rank: number; relevanceScore: number; }
```

Cosine similarity (no deps): `dot(a,b) / (|a| * |b|)` — O(n×1536), sub-ms for <200 chunks.

---

## State Management
All state in `app/page.tsx`. No URL routing.
```typescript
const [screen, setScreen]         = useState<AppScreen>('upload');
const [sessionId, setSessionId]   = useState<string | null>(null);
const [quiz, setQuiz]             = useState<QuizQuestion[]>([]);
const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
```
Tutor: `useChat({ api: '/api/tutor', body: { sessionId } })`

---

## UI Design
**Fun, not corporate.** Flashcard app energy. Indigo/violet accent, rounded cards, smooth transitions, celebratory score reveal.

**Review screen (70/30)**:
```
┌──────────────────────────────────┬────────────────┐
│  Quiz Review (70%)               │  Tutor (30%)   │
│  Score: 7/10 🎉                  │ [proactive msg]│
│  Q1 ✓  Q2 ✗ (highlights)        │ [chat + cites] │
│  [Start Over]                    │ [input]        │
└──────────────────────────────────┴────────────────┘
```
Tutor locked during quiz. After submit: score reveals, tutor sends one proactive message, input unlocks. Quiz stays visible for reference.

---

## LangSmith Trace Tree
```
tutor_rag_pipeline
  ├── expand_query     (chain)
  ├── embed_query      (embedding)
  ├── in_memory_search (retriever)
  ├── cohere_rerank    (chain) → scores[]
  └── gpt-4o-mini      (llm) → tokens
generate_quiz          (chain) — every upload
```

---

## Environment Variables
```
OPENAI_API_KEY= / COHERE_API_KEY= / LLAMA_CLOUD_API_KEY=
LANGSMITH_API_KEY= / LANGSMITH_TRACING_V2=true / LANGSMITH_PROJECT=quizzler
NEXT_PUBLIC_SUPABASE_URL= / NEXT_PUBLIC_SUPABASE_ANON_KEY=  # unused
```

---

## Implementation Order
1. `lib/types.ts` — all types first
2. `prompts/` — all three prompt files
3. `lib/chunker.ts` → `lib/session-store.ts` → `lib/in-memory-search.ts`
4. `lib/rag-pipeline.ts` — extract from existing `app/api/chat/route.ts`
5. `lib/parse-upload.ts` → `lib/quiz-generator.ts`
6. `app/api/upload/route.ts` → `app/api/tutor/route.ts`
7. Components: `upload-screen` → `loading-screen` → `quiz-screen/quiz-question` → `score-reveal` → `review-question/quiz-review` → `citation-block/tutor-chat` → `review-screen`
8. Rewrite `app/page.tsx` as screen orchestrator
9. Delete old files, update `globals.css`, update `README.md`

---

## Constraints & Decisions
- No auth, no DB writes — ephemeral, privacy-first
- Server-side session store (Map + 2hr TTL), not client state
- Pasted text capped at 10,000 chars on client
- Question range: 5–20, default 10
- Multiple choice only, 4 options, plausible distractors (content-related, not obviously wrong)
- Score shown at end only, client-side — no server round-trip
- Tutor sees full quiz context (questions, correct answers, user answers, score)
- One proactive tutor message after score reveal, then reactive only
- No retry on wrong answers — tutor explains on request
- "Start Over" resets all state → upload screen
- Session lost on page refresh — by design