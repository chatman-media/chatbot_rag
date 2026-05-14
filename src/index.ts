/**
 * @chatman-media/chatbot_rag — production-grade RAG engine for conversational bots.
 *
 * Quick start:
 *
 * ```ts
 * import { answerWithRag, OpenAIChatClient, OpenAIEmbeddingClient } from "@chatman-media/chatbot_rag";
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
export { answerWithRag, answerWithRagStream } from "./answer.ts";
export type { AnswerInput, AnswerResult, AnswerTelemetry, Persona } from "./answer-types.ts";
export { NO_CONTEXT_MARKER } from "./answer-types.ts";
// ── LLM clients ──────────────────────────────────────────────────────────────
export type { ChatClient, ChatCompletionOpts, ChatMessage, ChatRole } from "./chat.ts";
export { ChatApiError, OpenAIChatClient } from "./chat.ts";
export type { Chunk, ChunkOptions } from "./chunk.ts";
// ── Chunking ──────────────────────────────────────────────────────────────────
export { chunkText, estimateTokens } from "./chunk.ts";
export type { EmbeddingClient } from "./embed.ts";
export { EmbeddingApiError, NullEmbeddingClient, OpenAIEmbeddingClient } from "./embed.ts";
export type { ExtractFactsInput } from "./extract-user-facts.ts";
// ── Memory & conversation management ─────────────────────────────────────────
export { extractUserFacts, parseFactsFromLlmOutput } from "./extract-user-facts.ts";
export type { FactCheckInput, FactCheckResult } from "./fact-checker.ts";
// ── Hallucination guard ───────────────────────────────────────────────────────
export { checkFacts, parseFactCheckResult } from "./fact-checker.ts";
export type { GradeSkillsInput } from "./grade-skills.ts";
// ── Skill grading (post-hoc analytics) ───────────────────────────────────────
export { gradeSkills } from "./grade-skills.ts";
export type { IngestDeps, IngestDirectorySummary, IngestFileResult } from "./ingest.ts";
// ── Ingest pipeline ───────────────────────────────────────────────────────────
export {
  deriveTopicFromPath,
  ingestDirectory,
  ingestFile,
  ingestText,
  stripNonContent,
} from "./ingest.ts";
// ── PDF parsing ───────────────────────────────────────────────────────────────
export { parsePdf } from "./parse-pdf.ts";
// ── Persona shortcuts ─────────────────────────────────────────────────────────
export {
  botPresenceReply,
  isBotPresenceQuestion,
  isPersonalFactQuestion,
  isPersonaSmalltalkQuestion,
  personaFactReply,
  personaSmalltalkReply,
} from "./persona-shortcuts.ts";
// ── Sales-style prompt engine ────────────────────────────────────────────────
export { composeSystemPrompt } from "./prompt.ts";
export type { OllamaChatOptions } from "./providers/ollama-chat.ts";
// ── Provider implementations ─────────────────────────────────────────────────
export { OllamaChatClient } from "./providers/ollama-chat.ts";
export type { OllamaEmbeddingOptions } from "./providers/ollama-embed.ts";
export { OllamaEmbeddingClient } from "./providers/ollama-embed.ts";
export type { OpenRouterChatOptions } from "./providers/openrouter-chat.ts";
export { OpenRouterChatClient } from "./providers/openrouter-chat.ts";
export type { ReflectInput, ReflectResult } from "./reflect.ts";
export { parseReflection, verifyAnswer } from "./reflect.ts";
export type { RewriteQueryInput } from "./rewrite-query.ts";
// ── Retrieval enhancements ────────────────────────────────────────────────────
export { questionNeedsRewrite, rewriteQuery, sanitizeRewritten } from "./rewrite-query.ts";
// ── Output sanitization ───────────────────────────────────────────────────────
export { sanitizeLlmOutput } from "./sanitize.ts";
export { InMemoryKbStore } from "./stores/memory-store.ts";
export type {
  ComposeOptions,
  FunnelStage,
  Hook,
  HookKind,
  SalesFramework,
  SkillForPrompt,
  StageConfig,
  Style,
  StylePersona,
} from "./styles.ts";
export {
  FUNNEL_STAGES,
  HookSchema,
  PersonaSchema,
  SALES_FRAMEWORKS,
  StyleSchema,
} from "./styles.ts";
export type { SummarizeInput } from "./summarize-conversation.ts";
export { cleanSummary, summarizeConversation } from "./summarize-conversation.ts";
// ── Legacy / simple prompt builder ───────────────────────────────────────────
export {
  buildSystemPrompt,
  DEFAULT_PERSONA,
  legacyRagSamplingTemperature,
  renderSummaryBlock,
  renderUserFactsBlock,
} from "./system-prompt.ts";
export type { TextStyleRule } from "./text-style-rules.ts";
export {
  applyStyleRules,
  capitalizeFirstLetter,
  DEFAULT_STYLE_RULES,
  replaceEllipsis,
  replaceEmDash,
  stripAILeadIns,
  stripMarkdownBold,
} from "./text-style-rules.ts";
// ── Topic routing ─────────────────────────────────────────────────────────────
export { classifyTopic, classifyTopicAll, KNOWN_TOPICS } from "./topic-classifier.ts";
// ── Storage interfaces & implementations ─────────────────────────────────────
export type { IKbStore, IKbSuggestionsStore, KbSearchHit } from "./types.ts";

// ── Utilities ─────────────────────────────────────────────────────────────────
export { reciprocalRankFusion, sanitizeFtsQuery } from "./utils.ts";
