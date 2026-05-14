# @chatman/rag

Production-grade RAG (Retrieval-Augmented Generation) engine for conversational bots. Built for Telegram sales bots, works anywhere.

**What's included:**

- **Hybrid retrieval** — pgvector cosine search + BM25 full-text search, fused via Reciprocal Rank Fusion
- **Pluggable LLM providers** — OpenAI-compatible API, Ollama (local), OpenRouter (100+ models)
- **Sales-style prompt engine** — personas, NEPQ/AIDA/PAS/SPIN frameworks, A/B-ready styles
- **Hallucination guard** — single LLM call checks KB grounding + vacancy accuracy
- **Query rewriting** — resolves pronouns & elliptical follow-ups before retrieval
- **Topic routing** — deterministic regex classifier, no LLM call
- **Conversation memory** — user facts extraction, long-conversation summarization
- **Ingest pipeline** — `.md`, `.txt`, `.pdf` files with overlap chunking and dedup

## Install

```bash
bun add @chatman/rag
# or
npm install @chatman/rag
```

## Quick start

```ts
import {
  answerWithRag,
  OpenAIChatClient,
  OpenAIEmbeddingClient,
} from "@chatman/rag";

const chat = new OpenAIChatClient({
  apiKey: process.env.OPENAI_API_KEY!,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
});

const embedder = new OpenAIEmbeddingClient({
  apiKey: process.env.OPENAI_API_KEY!,
  baseUrl: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  dim: 1536,
});

// Implement IKbStore with your storage backend (see below)
const kb = new MyKbStore();

const result = await answerWithRag({
  question: "Какие вакансии есть в Дубае?",
  kb,
  chat,
  embedder,
  hybridSearch: true,
  topicRouting: true,
  reflect: true, // hallucination guard
});

console.log(result.text);        // bot reply
console.log(result.telemetry);   // retrieval_ms, generation_ms, path, ...
```

## IKbStore — bring your own storage

The engine is storage-agnostic. Implement `IKbStore` for your backend:

```ts
import type { IKbStore, KbSearchHit } from "@chatman/rag";

export class MyKbStore implements IKbStore {
  // Search methods (called by answerWithRag)
  async search(embedding: number[], k: number, topic?: string | null): Promise<KbSearchHit[]> { ... }
  async hybridSearch(input: { embedding: number[]; query: string; k?: number; topic?: string | null }): Promise<KbSearchHit[]> { ... }
  async prioritySearch(input: { embedding: number[]; query: string; k?: number; vectorOnly?: boolean }): Promise<KbSearchHit[]> { ... }

  // Ingest methods (called by ingestFile / ingestText)
  async getDocumentBySource(source: string): Promise<{ id: number; content_hash: string } | null> { ... }
  async countChunksForDocument(documentId: number): Promise<number> { ... }
  async deleteDocument(id: number): Promise<boolean> { ... }
  async upsertDocument(input: { source: string; title: string; contentHash: string; topic?: string | null }): Promise<{ id: number }> { ... }
  async insertChunkWithEmbedding(input: { documentId: number; chunkIndex: number; text: string; tokenCount: number; embedding: number[] }): Promise<void> { ... }
}
```

The reference PostgreSQL + pgvector implementation ships with [tg-chatbot](https://github.com/chatman-media/tg-chatbot) as `src/rag/store-adapter.ts`.

## Ingest documents

```ts
import { ingestFile, ingestDirectory, ingestText } from "@chatman/rag";

// Ingest a single file
await ingestFile("./docs/vacancies.md", { kb, embedder });

// Ingest a directory (auto-derives topic from subdirectory name)
await ingestDirectory("./kb/curated", { kb, embedder });
// kb/curated/visa/foo.md   → topic: "visa"
// kb/curated/payment/a.md  → topic: "payment"

// Ingest raw text (e.g. from admin paste form)
await ingestText({ title: "My doc", body: "..." }, { kb, embedder });
```

## LLM providers

```ts
import { OllamaChatClient, OllamaEmbeddingClient, OpenRouterChatClient } from "@chatman/rag";

// Local Ollama
const chat = new OllamaChatClient({ host: "http://localhost:11434", model: "qwen3:latest" });
const embedder = new OllamaEmbeddingClient({ host: "http://localhost:11434", model: "bge-m3", dim: 1024 });

// OpenRouter (Claude, GPT, Gemini, Llama, ...)
const chat = new OpenRouterChatClient({ apiKey: "sk-or-...", model: "anthropic/claude-haiku-4-5" });
```

## Sales-style prompt engine

```ts
import { composeSystemPrompt, answerWithRag } from "@chatman/rag";
import type { Style } from "@chatman/rag";

const style: Style = {
  slug: "alina-nepq",
  displayName: "Алина NEPQ",
  persona: { name: "Алина", role: "human", company: "Chatman Agency" },
  voice: { tone: "warm, curious, conversational", language: "ru", forbid: [] },
  framework: "NEPQ",
  hooks: [{ kind: "social_proof", text: "Большинство наших девочек выходят на доход за первые 2 недели" }],
  stages: {
    qualify: { goal: "Понять мотивацию и готовность кандидата", groundingRequired: false },
    pitch: { goal: "Показать конкретные условия по вакансии", groundingRequired: true },
  },
  fewShot: [],
  guardrails: { noMinors: true, botDisclosureOnDirectQuestion: true, forbiddenTopics: [] },
  model: { id: "qwen3:latest", temperature: 0.8, maxTokens: 256 },
};

const result = await answerWithRag({ question, kb, chat, embedder, style, stage: "qualify" });
```

## AnswerInput options

| Option | Default | Description |
|--------|---------|-------------|
| `topK` | `5` | Number of KB chunks to retrieve |
| `maxDistance` | — | Drop vector hits above this cosine distance |
| `hybridSearch` | `false` | Fuse vector + BM25 via RRF |
| `topicRouting` | `false` | Route retrieval to a topic slice |
| `booksPriority` | `false` | Search "books" topic first, global fallback |
| `rewriteQueryBeforeRetrieval` | `false` | Resolve pronouns/ellipsis with LLM |
| `reflect` | `false` | Hallucination guard (1 extra LLM call) |
| `vacanciesBlock` | — | Pre-rendered vacancies block (prepended to context) |
| `vacancyGuard` | `true` | Check vacancy accuracy when `vacanciesBlock` is set |
| `includeFewShot` | `true` | Include style few-shot examples (disable on follow-ups) |

## Telemetry

Every `answerWithRag` call returns telemetry — no configuration needed:

```ts
const { telemetry } = await answerWithRag({ ... });
// {
//   path: "ok" | "smalltalk" | "persona_fact" | "no_context" | "ungrounded",
//   retrieval_ms: 42,
//   generation_ms: 1250,
//   top_distances: [0.18, 0.23, 0.31],
//   hybrid: true,
//   topic: "visa",
//   factCheck: { grounded: true, vacancyOk: true }
// }
```

## Architecture

```
answerWithRag(AnswerInput)
  ├── Persona shortcuts (regex, no LLM): smalltalk / bot-presence / personal-fact
  ├── [optional] rewriteQuery — LLM resolves pronouns before retrieval
  ├── embedder.embed(question) → vector
  ├── kb.search / kb.hybridSearch / kb.prioritySearch → KbSearchHit[]
  ├── composeSystemPrompt (style) OR buildSystemPrompt (legacy)
  ├── chat.complete(messages) → raw reply
  ├── sanitizeLlmOutput — strip think-tags, markdown, AI lead-ins
  └── [optional] checkFacts — verify KB grounding + vacancy accuracy
```

## License

MIT — Alexander Kireev / [chatman-media](https://github.com/chatman-media)
