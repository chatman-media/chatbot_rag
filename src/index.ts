/**
 * @chatman/rag — production-grade RAG engine for conversational bots.
 *
 * Quick start:
 *
 * ```ts
 * import { answerWithRag, OpenAIChatClient, OpenAIEmbeddingClient } from "@chatman/rag";
 *
 * const chat = new OpenAIChatClient({ apiKey, baseUrl, model: "gpt-4o-mini" });
 * const embedder = new OpenAIEmbeddingClient({ apiKey, baseUrl, model: "text-embedding-3-small", dim: 1536 });
 *
 * const result = await answerWithRag({ question, kb: myKbStore, chat, embedder });
 * console.log(result.text);
 * ```
 *
 * See README.md for full usage and `IKbStore` implementation guide.
 */

// ── Core answer pipeline ─────────────────────────────────────────────────────
export { answerWithRag } from "./answer.ts";
export type { AnswerInput, AnswerResult, AnswerTelemetry, Persona } from "./answer-types.ts";
export { NO_CONTEXT_MARKER } from "./answer-types.ts";

// ── Storage interfaces ────────────────────────────────────────────────────────
export type { IKbStore, IKbSuggestionsStore, KbSearchHit } from "./types.ts";

// ── LLM clients ──────────────────────────────────────────────────────────────
export type { ChatClient, ChatMessage, ChatRole } from "./chat.ts";
export { ChatApiError, OpenAIChatClient } from "./chat.ts";
export type { EmbeddingClient } from "./embed.ts";
export { EmbeddingApiError, NullEmbeddingClient, OpenAIEmbeddingClient } from "./embed.ts";

// ── Provider implementations ─────────────────────────────────────────────────
export { OllamaChatClient } from "./providers/ollama-chat.ts";
export type { OllamaChatOptions } from "./providers/ollama-chat.ts";
export { OllamaEmbeddingClient } from "./providers/ollama-embed.ts";
export type { OllamaEmbeddingOptions } from "./providers/ollama-embed.ts";
export { OpenRouterChatClient } from "./providers/openrouter-chat.ts";
export type { OpenRouterChatOptions } from "./providers/openrouter-chat.ts";

// ── Sales-style prompt engine ────────────────────────────────────────────────
export { composeSystemPrompt } from "./prompt.ts";
export type { ComposeOptions, SkillForPrompt } from "./styles.ts";
export type {
  FunnelStage,
  Hook,
  HookKind,
  SalesFramework,
  StageConfig,
  Style,
  StylePersona,
} from "./styles.ts";
export { FUNNEL_STAGES, HookSchema, PersonaSchema, SALES_FRAMEWORKS, StyleSchema } from "./styles.ts";

// ── Legacy / simple prompt builder ───────────────────────────────────────────
export {
  buildSystemPrompt,
  DEFAULT_PERSONA,
  legacyRagSamplingTemperature,
  renderSummaryBlock,
  renderUserFactsBlock,
} from "./system-prompt.ts";

// ── Ingest pipeline ───────────────────────────────────────────────────────────
export {
  deriveTopicFromPath,
  ingestDirectory,
  ingestFile,
  ingestText,
  stripNonContent,
} from "./ingest.ts";
export type { IngestDeps, IngestDirectorySummary, IngestFileResult } from "./ingest.ts";

// ── Chunking ──────────────────────────────────────────────────────────────────
export { chunkText, estimateTokens } from "./chunk.ts";
export type { Chunk, ChunkOptions } from "./chunk.ts";

// ── PDF parsing ───────────────────────────────────────────────────────────────
export { parsePdf } from "./parse-pdf.ts";

// ── Output sanitization ───────────────────────────────────────────────────────
export { sanitizeLlmOutput } from "./sanitize.ts";
export {
  applyStyleRules,
  capitalizeFirstLetter,
  DEFAULT_STYLE_RULES,
  replaceEmDash,
  replaceEllipsis,
  stripAILeadIns,
  stripMarkdownBold,
} from "./text-style-rules.ts";
export type { TextStyleRule } from "./text-style-rules.ts";

// ── Retrieval enhancements ────────────────────────────────────────────────────
export { questionNeedsRewrite, rewriteQuery, sanitizeRewritten } from "./rewrite-query.ts";
export type { RewriteQueryInput } from "./rewrite-query.ts";

// ── Hallucination guard ───────────────────────────────────────────────────────
export { checkFacts, parseFactCheckResult } from "./fact-checker.ts";
export type { FactCheckInput, FactCheckResult } from "./fact-checker.ts";
export { parseReflection, verifyAnswer } from "./reflect.ts";
export type { ReflectInput, ReflectResult } from "./reflect.ts";

// ── Topic routing ─────────────────────────────────────────────────────────────
export { classifyTopic, classifyTopicAll, KNOWN_TOPICS } from "./topic-classifier.ts";

// ── Persona shortcuts ─────────────────────────────────────────────────────────
export {
  botPresenceReply,
  isBotPresenceQuestion,
  isPersonalFactQuestion,
  isPersonaSmalltalkQuestion,
  personaFactReply,
  personaSmalltalkReply,
} from "./persona-shortcuts.ts";

// ── Memory & conversation management ─────────────────────────────────────────
export { extractUserFacts, parseFactsFromLlmOutput } from "./extract-user-facts.ts";
export type { ExtractFactsInput } from "./extract-user-facts.ts";
export { cleanSummary, summarizeConversation } from "./summarize-conversation.ts";
export type { SummarizeInput } from "./summarize-conversation.ts";

// ── Skill grading (post-hoc analytics) ───────────────────────────────────────
export { gradeSkills } from "./grade-skills.ts";
export type { GradeSkillsInput } from "./grade-skills.ts";
