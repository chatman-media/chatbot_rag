<div align="center">

<a name="top"></a>

# @chatman-media/rag

**Production-grade RAG-движок для разговорных ботов**

[![npm version](https://img.shields.io/npm/v/@chatman-media/rag?logo=npm&color=22c55e)](https://www.npmjs.com/package/@chatman-media/rag)
[![CI](https://github.com/chatman-media/rag/actions/workflows/ci.yml/badge.svg)](https://github.com/chatman-media/rag/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-compatible-fbf0df?logo=bun&logoColor=black)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![used by @chatman-media/sales](https://img.shields.io/badge/used%20by-@chatman--media%2Fsales-6366f1)](https://github.com/chatman-media/sales)
[![pgvector](https://img.shields.io/badge/pgvector-hybrid%20search-336791?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-compatible-412991?logo=openai&logoColor=white)](https://platform.openai.com/docs/api-reference)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black?logo=ollama)](https://ollama.com/)

Гибридный поиск · Продажные персоны · Защита от галлюцинаций · Ноль зависимостей от фреймворков

---

🌐 **Language / Язык / 语言**

[🇬🇧 English](README.md) &nbsp;·&nbsp; 🇷🇺 **Русский** &nbsp;·&nbsp; [🇨🇳 中文](README.zh.md)

</div>

---

## Зачем @chatman-media/rag?

Большинство RAG-демо останавливаются на схеме «embed → search → prompt». Этот пакет показывает, как выглядит **продакшн**:

| Возможность | Описание |
|-------------|----------|
| 🔍 **Гибридный поиск** | pgvector cosine + BM25 full-text, слияние через Reciprocal Rank Fusion |
| 🧠 **Защита от галлюцинаций** | Один вызов LLM проверяет и заземлённость на базе знаний, и доменные факты |
| ✏️ **Переформулировка запросов** | Разрешает местоимения и эллиптические уточнения до поиска |
| 🎭 **Продажные персоны** | Фреймворки NEPQ / AIDA / PAS / SPIN, конфиги стилей готовы к A/B |
| 🏷️ **Маршрутизация по теме** | Детерминированный regex-классификатор, нулевая задержка и стоимость |
| 🔌 **Сменные бэкенды** | Любое хранилище через `IKbStore`; любой LLM через `ChatClient` |
| 📄 **Пайплайн загрузки** | `.md` / `.txt` / `.pdf` с перекрывающейся нарезкой и SHA-256 дедупликацией |
| 💬 **Память** | Извлечение фактов о пользователе между сессиями + сжатие диалога |

## Установка

```bash
bun add @chatman-media/rag     # Bun
npm install @chatman-media/rag # npm / pnpm / yarn
```

**Требования:** Node 18+ или Bun 1.x. Нет нативных модулей — чистый TypeScript.

## Быстрый старт

```ts
import { answerWithRag, OpenAIChatClient, OpenAIEmbeddingClient } from "@chatman-media/rag";

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
  question: "Какие условия работы в Дубае?",
  kb: myKbStore,       // ваша реализация IKbStore — см. ниже
  chat,
  embedder,
  hybridSearch: true,  // слияние vector + BM25
  topicRouting: true,  // поиск с фильтром по теме
  reflect: true,       // защита от галлюцинаций
});

console.log(result.text);       // ответ бота
console.log(result.telemetry);  // retrieval_ms, generation_ms, path, factCheck, ...
```

## Архитектура

```
answerWithRag(question, kb, chat, embedder, options?)
│
├─ 🚀 Быстрые ответы персоны (regex, без вызова LLM)
│     small-talk · присутствие бота · личные факты
│
├─ ✏️  [опционально] rewriteQuery
│     LLM разворачивает «а там?» / «это сколько?» в полный вопрос
│
├─ 🔢 embedder.embed(question) → float32[]
│
├─ 🔍 Поиск
│     ├─ vector: kb.search(embedding, k, topic?)
│     ├─ BM25:   kb.searchBm25(query, k, topic?)      ← гибридный режим
│     └─ RRF-слияние → KbSearchHit[]
│
├─ 📝 Составление промпта
│     composeSystemPrompt(style, stage, kbContext)     ← режим продаж
│     buildSystemPrompt(persona, context)              ← устаревший режим
│
├─ 🤖 chat.complete(messages) → сырая строка
│
├─ 🧹 sanitizeLlmOutput
│     удаляет <think> · markdown · тире · AI-зачины
│
└─ 🛡️  [опционально] checkFacts
      проверка заземлённости на KB + доменные факты
      → grounded=false → возвращает NO_CONTEXT_MARKER
```

## Реализация IKbStore

Движок не зависит от хранилища. Реализуйте `IKbStore` для вашего бэкенда:

```ts
import type { IKbStore, KbSearchHit } from "@chatman-media/rag";

class MyKbStore implements IKbStore {
  async search(embedding: number[], k: number, topic?: string | null): Promise<KbSearchHit[]> {
    // Чистый векторный поиск — косинусное расстояние, меньше = ближе
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

  async getDocumentBySource(source: string) { ... }
  async countChunksForDocument(documentId: number) { ... }
  async deleteDocument(id: number) { ... }
  async upsertDocument(input: { source; title; contentHash; topic? }) { ... }
  async insertChunkWithEmbedding(input: { documentId; chunkIndex; text; tokenCount; embedding }) { ... }
}
```

## LLM-провайдеры

```ts
import {
  OpenAIChatClient,          // OpenAI, Together, Groq, любой OpenAI-совместимый
  OllamaChatClient,          // локальные модели через Ollama
  OpenRouterChatClient,      // 100+ моделей по одному API-ключу
  OpenAIEmbeddingClient,
  OllamaEmbeddingClient,
} from "@chatman-media/rag";

// Локальный Ollama (qwen3, llama3, mistral, …)
const chat = new OllamaChatClient({
  host: "http://localhost:11434",
  model: "qwen3:latest",
  disableThinking: true,  // убирать блоки <think>…</think>
  timeoutMs: 5 * 60_000,
});

// OpenRouter — менять модели без правки кода
const chat = new OpenRouterChatClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: "anthropic/claude-haiku-4-5",
});

// Кастомный эндпоинт (Together, Groq, Azure, локальный vLLM…)
const chat = new OpenAIChatClient({
  apiKey: process.env.TOGETHER_API_KEY!,
  baseUrl: "https://api.together.xyz/v1",
  model: "meta-llama/Llama-3-8b-chat-hf",
});
```

## Загрузка документов

```ts
import { ingestFile, ingestDirectory, ingestText } from "@chatman-media/rag";

// Один файл
await ingestFile("./docs/faq.md", { kb, embedder });

// Директория — тема берётся из названия поддиректории
await ingestDirectory("./knowledge-base", { kb, embedder });
// knowledge-base/visa/requirements.md    → topic: "visa"
// knowledge-base/payment/salaries.md    → topic: "payment"
// knowledge-base/intro.md               → topic: null (глобальный)

// Сырой текст (вставка в админке, загрузка через API, …)
await ingestText(
  { title: "Product FAQ", body: markdownString },
  { kb, embedder, topic: "faq" }
);
```

Контент дедуплицируется по SHA-256 — повторная загрузка неизменённых файлов ничего не делает.

## Продажные персоны

Для ботов, которые должны конвертировать, а не просто отвечать:

```ts
import { answerWithRag } from "@chatman-media/rag";
import type { Style } from "@chatman-media/rag";

const style: Style = {
  slug: "alina-nepq",
  displayName: "Alina NEPQ",
  persona: {
    name: "Alina",
    role: "human",          // притворяется реальным человеком, никогда не признаётся что AI
    company: "My Agency",
    facts: { city: "Istanbul", age: "26" },
  },
  voice: {
    tone: "тёплый, любопытный, краткий — как настоящий WhatsApp-диалог",
    language: "ru",
    forbid: ["конечно!", "разумеется!", "как ИИ"],
  },
  framework: "NEPQ",        // AIDA | PAS | SPIN | NEPQ | straight_line
  hooks: [
    { kind: "social_proof", text: "Большинство наших девочек выходят на целевой доход за 2 недели" },
    { kind: "scarcity",     text: "На следующий рейс осталось 3–5 мест" },
  ],
  stages: {
    qualify: { goal: "Понять мотивацию и готовность", groundingRequired: false },
    pitch:   { goal: "Представить условия конкретной вакансии", groundingRequired: true },
  },
  fewShot: [
    { stage: "qualify", user: "сколько там платят?", assistant: "Зависит от города — куда смотришь?" },
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
  skills: activeSkills,     // техники убеждения из вашей БД
});
```

## Параметры AnswerInput

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `topK` | `number` | `5` | Количество чанков из базы знаний |
| `maxDistance` | `number` | — | Отбросить векторные результаты выше этого косинусного расстояния |
| `hybridSearch` | `boolean` | `false` | Слияние vector + BM25 через RRF |
| `topicRouting` | `boolean` | `false` | Ограничить поиск срезом по теме |
| `booksPriority` | `boolean` | `false` | Сначала искать в теме "books", затем глобально |
| `rewriteQueryBeforeRetrieval` | `boolean` | `false` | Разрешить местоимения/эллипсис через LLM |
| `reflect` | `boolean` | `false` | Защита от галлюцинаций (1 доп. вызов LLM) |
| `vacanciesBlock` | `string` | — | Готовый блок вакансий, добавляемый в контекст |
| `vacancyGuard` | `boolean` | `true` | Проверять точность вакансий при наличии `vacanciesBlock` |
| `includeFewShot` | `boolean` | `true` | Включать few-shot примеры из стиля |
| `numPredict` | `number` | — | Жёсткий лимит токенов на вывод |
| `userFacts` | `Record<string,string>` | — | Факты о пользователе из других сессий, вставляются в промпт |
| `conversationSummary` | `string` | — | Сжатые старые витки диалога, вставляются в промпт |
| `skills` | `SkillForPrompt[]` | — | Техники убеждения, привязанные к активному стилю |

## Телеметрия

Каждый вызов возвращает структурированную телеметрию — настройка не нужна:

```ts
const { text, telemetry } = await answerWithRag({ ... });

// структура telemetry:
{
  path: "ok",              // ok | smalltalk | persona_fact | no_context | ungrounded
  retrieval_ms: 38,
  generation_ms: 1240,
  top_distances: [0.18, 0.22, 0.31, 0.35, 0.42],
  hybrid: true,
  topic: "visa",           // null если классификатор не дал результата
  original_query: "а там?",
  rewritten_query: "какие требования по визе в Дубае?",
  factCheck: {
    grounded: true,
    vacancyOk: true,
  }
}
```

Сохраняйте телеметрию в таблице сообщений для анализа: тренды качества поиска, уровень галлюцинаций по модели, результаты A/B-экспериментов.

## Роадмап

### ✅ Реализовано
- [x] Гибридный поиск — pgvector + BM25 + Reciprocal Rank Fusion
- [x] Защита от галлюцинаций (`reflect`, `vacancyGuard`)
- [x] Переформулировка запросов перед поиском
- [x] Продажные персоны — NEPQ / AIDA / PAS / SPIN
- [x] Маршрутизация по теме — regex-классификатор с нулевой задержкой
- [x] Загрузка документов — `.md` / `.txt` / `.pdf` с SHA-256 дедупликацией
- [x] Память между сессиями — извлечение фактов + сжатие диалога
- [x] Стриминг — `answerWithRagStream()`, `ChatClient.stream()`
- [x] Колбэк `onTelemetry` — метрики без настройки на каждый вызов
- [x] `InMemoryKbStore` — хранилище без базы данных для тестов и прототипов
- [x] Retry + экспоненциальный backoff — `withRetryChatClient()`, `withRetryEmbeddingClient()`
- [x] Семантический кэш — `SemanticCache` с порогом косинусного сходства
- [x] Семантическая нарезка — `chunkBySections()` по заголовкам Markdown

### ✅ Также реализовано
- [x] **Reranker** — опциональный cross-encoder после RRF (`CohereReranker`, `JinaReranker`)
- [x] **Утилиты оценки качества** — `evalRetrieval()` → recall@k, MRR, NDCG
- [x] **`IConversationStore`** — единый интерфейс для хранения истории и summary сессий
- [x] **A/B-роутер** — рандомизация стилей по `userId`, логирование конверсии через `onTelemetry`
- [x] **SSE сервер** — `createRagServer()` на Bun.serve() со стримингом токенов
- [x] **Multi-cycle tool calling** — агентный цикл вызова инструментов с параллельным выполнением, ограниченный `maxToolCycles` (работает в `answerWithRag` и `answerWithRagStream`)

### 🚧 В планах
- [ ] **`PgVectorKbStore`** — готовый адаптер `IKbStore` для pgvector из коробки
- [ ] **Доп. адаптеры хранилищ** — бэкенды Qdrant и Pinecone
- [ ] **OpenTelemetry exporter** — экспорт событий `onTelemetry` в спаны и метрики OTel
- [ ] **Учёт токенов и стоимости** — количество токенов и стоимость каждого вызова в телеметрии
- [ ] **Contextual retrieval** — добавление контекста к чанкам перед эмбеддингом для роста recall
- [ ] **Кеш эмбеддингов** — кеширование эмбеддингов по хешу текста для экономии запросов

## Участие в разработке

PR и issues приветствуются. Смотрите [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

[MIT](LICENSE) — Alexander Kireev / [chatman-media](https://github.com/chatman-media)

---

<div align="center">

[🇬🇧 English](README.md) &nbsp;·&nbsp; 🇷🇺 **Русский** &nbsp;·&nbsp; [🇨🇳 中文](README.zh.md)

</div>
