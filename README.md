<div align="center">

# @chatman/rag

**Production-grade RAG engine for conversational bots**

[![CI](https://github.com/chatman-media/chatbot_rag/actions/workflows/ci.yml/badge.svg)](https://github.com/chatman-media/chatbot_rag/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-compatible-fbf0df?logo=bun&logoColor=black)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![pgvector](https://img.shields.io/badge/pgvector-hybrid%20search-336791?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-compatible-412991?logo=openai&logoColor=white)](https://platform.openai.com/docs/api-reference)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black?logo=ollama)](https://ollama.com/)

Hybrid retrieval · Sales-style personas · Hallucination guard · Zero framework dependencies

</div>

---

## Why @chatman/rag?

Most RAG demos stop at "embed → search → prompt". This package ships what **production** looks like:

| Feature | Details |
|---------|---------|
| 🔍 **Hybrid retrieval** | pgvector cosine + BM25 full-text, fused via Reciprocal Rank Fusion |
| 🧠 **Hallucination guard** | Single LLM call checks KB grounding _and_ domain-specific facts |
| ✏️ **Query rewriting** | Resolves pronouns & elliptical follow-ups before retrieval |
| 🎭 **Sales personas** | NEPQ / AIDA / PAS / SPIN frameworks, A/B-ready style configs |
| 🏷️ **Topic routing** | Deterministic regex classifier, zero latency, zero cost |
| 🔌 **Pluggable backends** | Any storage via `IKbStore`; any LLM via `ChatClient` |
| 📄 **Ingest pipeline** | `.md` / `.txt` / `.pdf` with overlap chunking and SHA-256 dedup |
| 💬 **Memory** | Cross-session user-facts extraction + conversation summarization |

## Install

```bash
bun add @chatman/rag     # Bun
npm install @chatman/rag # npm / pnpm / yarn
```

**Peer requirements:** Node 18+ or Bun 1.x. No native modules — pure TypeScript.

## Quick start

```ts
import { answerWithRag, OpenAIChatClient, OpenAIEmbeddingClient } from "@chatman/rag";

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

const result = await answerWithRag({
  question: "What are the working conditions in Dubai?",
  kb: myKbStore,       // your IKbStore implementation — see below
  chat,
  embedder,
  hybridSearch: true,  // vector + BM25 fusion
  topicRouting: true,  // free topic-scoped retrieval
  reflect: true,       // hallucination guard
});

console.log(result.text);       // bot reply
console.log(result.telemetry);  // retrieval_ms, generation_ms, path, factCheck, ...
```

## Architecture

```
answerWithRag(question, kb, chat, embedder, options?)
│
├─ 🚀 Persona shortcuts (regex, no LLM call)
│     smalltalk · bot-presence · personal-facts
│
├─ ✏️  [optional] rewriteQuery
│     LLM resolves "а там?" / "это сколько?" into full question
│
├─ 🔢 embedder.embed(question) → float32[]
│
├─ 🔍 Retrieval
│     ├─ vector: kb.search(embedding, k, topic?)
│     ├─ BM25:   kb.searchBm25(query, k, topic?)      ← hybrid mode
│     └─ RRF fusion → KbSearchHit[]
│
├─ 📝 Prompt composition
│     composeSystemPrompt(style, stage, kbContext)     ← sales mode
│     buildSystemPrompt(persona, context)              ← legacy mode
│
├─ 🤖 chat.complete(messages) → raw string
│
├─ 🧹 sanitizeLlmOutput
│     strips <think> · markdown · em-dashes · AI lead-ins
│
└─ 🛡️  [optional] checkFacts
      KB grounding + domain-specific fact verification
      → grounded=false → return NO_CONTEXT_MARKER
```

## Implement IKbStore

The engine is storage-agnostic. Implement `IKbStore` for your backend:

```ts
import type { IKbStore, KbSearchHit } from "@chatman/rag";

class MyKbStore implements IKbStore {
  // ── Search (called by answerWithRag) ──────────────────────────────

  async search(embedding: number[], k: number, topic?: string | null): Promise<KbSearchHit[]> {
    // Pure vector search — cosine distance, lower = closer
    return db.query(`
      SELECT chunk_id, text, source, title,
             (embedding <=> $1::vector) AS distance
      FROM kb_chunks
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $2
    `, [JSON.stringify(embedding), k]);
  }

  async hybridSearch(input: {
    embedding: number[]; query: string; k?: number; topic?: string | null;
  }): Promise<KbSearchHit[]> {
    const vec = await this.search(input.embedding, (input.k ?? 5) * 2, input.topic);
    const bm25 = await this.searchBm25(input.query, (input.k ?? 5) * 2, input.topic);
    return reciprocalRankFusion(vec, bm25, input.k ?? 5);
  }

  async prioritySearch(input: {
    embedding: number[]; query: string; k?: number; vectorOnly?: boolean;
  }): Promise<KbSearchHit[]> {
    const books = await this.searchTopic(input.embedding, "books", input.k ?? 5);
    if (books.length > 0) return books;
    return input.vectorOnly
      ? this.search(input.embedding, input.k ?? 5)
      : this.hybridSearch(input);
  }

  // ── Ingest (called by ingestFile / ingestText) ────────────────────

  async getDocumentBySource(source: string) { ... }
  async countChunksForDocument(documentId: number) { ... }
  async deleteDocument(id: number) { ... }
  async upsertDocument(input: { source; title; contentHash; topic? }) { ... }
  async insertChunkWithEmbedding(input: { documentId; chunkIndex; text; tokenCount; embedding }) { ... }
}
```

> **Reference implementation** (PostgreSQL + pgvector) ships in the main [tg-chatbot](https://github.com/chatman-media/tg-chatbot) repo as `src/rag/store-adapter.ts`.

## LLM providers

```ts
import {
  OpenAIChatClient,          // OpenAI, Together, Groq, any OpenAI-compatible
  OllamaChatClient,          // local models via Ollama
  OpenRouterChatClient,      // 100+ models behind one API key
  OpenAIEmbeddingClient,
  OllamaEmbeddingClient,
} from "@chatman/rag";

// Local Ollama (qwen3, llama3, mistral, …)
const chat = new OllamaChatClient({
  host: "http://localhost:11434",
  model: "qwen3:latest",
  disableThinking: true,  // strip <think>…</think> blocks
  timeoutMs: 5 * 60_000,
});

// OpenRouter — swap models without changing code
const chat = new OpenRouterChatClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: "anthropic/claude-haiku-4-5",
});

// Custom endpoint (Together, Groq, Azure, local vLLM…)
const chat = new OpenAIChatClient({
  apiKey: process.env.TOGETHER_API_KEY!,
  baseUrl: "https://api.together.xyz/v1",
  model: "meta-llama/Llama-3-8b-chat-hf",
});
```

## Ingest documents

```ts
import { ingestFile, ingestDirectory, ingestText } from "@chatman/rag";

// Single file
await ingestFile("./docs/faq.md", { kb, embedder });

// Directory — auto-derives topic tag from subdirectory name
await ingestDirectory("./knowledge-base", { kb, embedder });
// knowledge-base/visa/requirements.md    → topic: "visa"
// knowledge-base/payment/salaries.md    → topic: "payment"
// knowledge-base/intro.md               → topic: null (global)

// Raw text (admin paste, API upload, …)
await ingestText(
  { title: "Product FAQ", body: markdownString },
  { kb, embedder, topic: "faq" }
);
```

Content is SHA-256 deduped — re-ingesting unchanged files is a no-op.

## Sales personas

For bots that need to convert, not just answer:

```ts
import { answerWithRag } from "@chatman/rag";
import type { Style } from "@chatman/rag";

const style: Style = {
  slug: "alina-nepq",
  displayName: "Alina NEPQ",
  persona: {
    name: "Alina",
    role: "human",          // poses as a real person, never admits to being AI
    company: "My Agency",
    facts: { city: "Istanbul", age: "26" },
  },
  voice: {
    tone: "warm, curious, brief — like a real WhatsApp conversation",
    language: "ru",
    forbid: ["certainly!", "of course!", "as an AI"],
  },
  framework: "NEPQ",        // AIDA | PAS | SPIN | NEPQ | straight_line
  hooks: [
    { kind: "social_proof", text: "Most of our girls hit their income target within 2 weeks" },
    { kind: "scarcity",     text: "Only 3–5 spots left on the next flight" },
  ],
  stages: {
    qualify: { goal: "Understand motivation and readiness", groundingRequired: false },
    pitch:   { goal: "Present specific vacancy conditions",  groundingRequired: true },
  },
  fewShot: [
    { stage: "qualify", user: "how much do they pay?", assistant: "Depends on the city — where are you thinking?" },
  ],
  guardrails: {
    noMinors: true,
    botDisclosureOnDirectQuestion: true,
    forbiddenTopics: [],
  },
  model: { id: "qwen3:latest", temperature: 0.8, maxTokens: 256 },
};

const result = await answerWithRag({
  question, kb, chat, embedder,
  style,
  stage: "qualify",         // opener | qualify | pitch | objection | close
  hybridSearch: true,
  skills: activeSkills,     // persuasion techniques loaded from your DB
});
```

## AnswerInput options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `topK` | `number` | `5` | KB chunks to retrieve |
| `maxDistance` | `number` | — | Drop vector hits above this cosine distance |
| `hybridSearch` | `boolean` | `false` | Fuse vector + BM25 via RRF |
| `topicRouting` | `boolean` | `false` | Route retrieval to a topic slice first |
| `booksPriority` | `boolean` | `false` | Search "books" topic first, global fallback |
| `rewriteQueryBeforeRetrieval` | `boolean` | `false` | Resolve pronouns/ellipsis with LLM |
| `reflect` | `boolean` | `false` | Hallucination guard (1 extra LLM call) |
| `vacanciesBlock` | `string` | — | Pre-rendered vacancies prepended to context |
| `vacancyGuard` | `boolean` | `true` | Check vacancy accuracy when `vacanciesBlock` is set |
| `includeFewShot` | `boolean` | `true` | Include style few-shot examples |
| `numPredict` | `number` | — | Hard cap on output tokens |
| `userFacts` | `Record<string,string>` | — | Cross-session user memory injected into prompt |
| `conversationSummary` | `string` | — | Compressed older turns injected into prompt |
| `skills` | `SkillForPrompt[]` | — | Persuasion techniques attached to the active style |

## Telemetry

Every call returns structured telemetry — no setup required:

```ts
const { text, telemetry } = await answerWithRag({ ... });

// telemetry shape:
{
  path: "ok",              // ok | smalltalk | persona_fact | no_context | ungrounded
  retrieval_ms: 38,
  generation_ms: 1240,
  top_distances: [0.18, 0.22, 0.31, 0.35, 0.42],
  hybrid: true,
  topic: "visa",           // null when classifier was inconclusive
  original_query: "а там?",
  rewritten_query: "what are the visa requirements in Dubai?",
  factCheck: {
    grounded: true,
    vacancyOk: true,
  }
}
```

Store it in your messages table for later analysis: retrieval quality trends, hallucination rate by model, A/B experiment outcomes.

## Contributing

PRs and issues welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — Alexander Kireev / [chatman-media](https://github.com/chatman-media)
