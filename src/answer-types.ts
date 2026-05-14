import type { ChatClient, ChatMessage } from "./chat.ts";
import type { EmbeddingClient } from "./embed.ts";
import type { FunnelStage, SkillForPrompt, Style } from "./styles.ts";
import type { IKbStore, KbSearchHit } from "./types.ts";

export const NO_CONTEXT_MARKER = "__NO_CONTEXT__";

export interface Persona {
  name: string;
  role: "human" | "assistant";
  company?: string;
  /**
   * Fixed personal facts about the persona — bypasses RAG for direct personal
   * questions and injects into the system prompt as inviolable grounding.
   * Known keys: "city", "age", "status", "experience", "phone".
   */
  facts?: Record<string, string>;
}

export interface AnswerInput {
  question: string;
  kb: IKbStore;
  embedder: EmbeddingClient;
  chat: ChatClient;
  history?: ChatMessage[];
  topK?: number;
  maxDistance?: number;
  persona?: Persona;
  style?: Style;
  stage?: FunnelStage;
  includeFewShot?: boolean;
  numPredict?: number;
  userFacts?: Record<string, string>;
  rewriteQueryBeforeRetrieval?: boolean;
  reflect?: boolean;
  hybridSearch?: boolean;
  conversationSummary?: string;
  topicRouting?: boolean;
  vacanciesBlock?: string;
  vacancyGuard?: boolean;
  skills?: readonly SkillForPrompt[];
  booksPriority?: boolean;
  /**
   * Called after every `answerWithRag` or `answerWithRagStream` call with the
   * final telemetry. Useful for logging, metrics, or A/B experiment recording
   * without having to unwrap the return value.
   */
  onTelemetry?: (telemetry: AnswerTelemetry) => void;
}

export interface AnswerTelemetry {
  path: "smalltalk" | "persona_fact" | "no_context" | "ungrounded" | "ok" | "cache_hit";
  total_ms?: number;
  retrieval_ms?: number;
  generation_ms?: number;
  top_distances?: number[];
  hybrid?: boolean;
  topic?: string | null;
  original_query?: string;
  rewritten_query?: string;
  factCheck?: { grounded: boolean; vacancyOk: boolean; reason?: string };
}

export interface AnswerResult {
  text: string;
  usedChunkIds: number[];
  hits: KbSearchHit[];
  telemetry: AnswerTelemetry;
}
