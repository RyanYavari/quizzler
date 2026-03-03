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
Quizzler uses a 5-step deterministic RAG pipeline to answer questions from your study materials:

1. **Query Expansion** — Rewrites your question into richer search terminology using `gpt-4o-mini`
2. **Embedding** — Converts the expanded query into a 1536-dimensional vector using `text-embedding-3-small`
3. **Hybrid Search** — Runs both semantic (pgvector cosine) and keyword (BM25) search against your documents, fusing results with Reciprocal Rank Fusion (RRF)
4. **Reranking** — Re-scores the top 20 results using Cohere's cross-encoder, returning the top 5 most relevant chunks
5. **Generation** — Streams a cited response using `gpt-4o-mini`, grounded strictly in your documents

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/RyanYavari/quizzler.git
   cd quizzler
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables: create a `.env` file in the root directory with your API keys and database URL.

## Running the App
```bash
npm run dev
```
Open the app at `http://localhost:8000`.

## Contributing
Feel free to fork the repository, make changes, and submit pull requests.

## License
This project is licensed under the MIT License — see the LICENSE file for details.
