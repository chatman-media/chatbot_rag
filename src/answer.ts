import { composeSystemPrompt } from "./prompt.ts";
import type { FunnelStage } from "./styles.ts";
import type { KbSearchHit } from "./types.ts";
import {
  type AnswerInput,
  type AnswerResult,
  type AnswerTelemetry,
  NO_CONTEXT_MARKER,
  type Persona,
} from "./answer-types.ts";
import type { ChatMessage } from "./chat.ts";
import { checkFacts } from "./fact-checker.ts";
import {
  botPresenceReply,
  isBotPresenceQuestion,
  isPersonalFactQuestion,
  isPersonaSmalltalkQuestion,
  personaFactReply,
  personaSmalltalkReply,
} from "./persona-shortcuts.ts";
import { rewriteQuery } from "./rewrite-query.ts";
import { sanitizeLlmOutput } from "./sanitize.ts";
import {
  buildSystemPrompt,
  DEFAULT_PERSONA,
  legacyRagSamplingTemperature,
} from "./system-prompt.ts";
import { applyStyleRules } from "./text-style-rules.ts";
import { classifyTopic } from "./topic-classifier.ts";

// Re-exports for backward compatibility with existing importers.
export {
  type AnswerInput,
  type AnswerResult,
  type AnswerTelemetry,
  NO_CONTEXT_MARKER,
  type Persona,
} from "./answer-types.ts";
export {
  botPresenceReply,
  isBotPresenceQuestion,
  isPersonalFactQuestion,
  isPersonaSmalltalkQuestion,
  personaFactReply,
  personaSmalltalkReply,
} from "./persona-shortcuts.ts";
export { sanitizeLlmOutput } from "./sanitize.ts";
export {
  buildSystemPrompt,
  legacyRagSamplingTemperature,
  renderSummaryBlock,
  renderUserFactsBlock,
} from "./system-prompt.ts";

async function answerFromHits(opts: {
  hits: KbSearchHit[];
  baseTelemetry: AnswerTelemetry;
  startedAt: number;
  input: AnswerInput;
  activePersona: Persona;
}): Promise<AnswerResult> {
  const { hits, baseTelemetry, startedAt, input, activePersona } = opts;
  const vacBlock = (input.vacanciesBlock ?? "").trim();

  if (hits.length === 0 && !vacBlock && !input.style) {
    return {
      text: NO_CONTEXT_MARKER,
      usedChunkIds: [],
      hits: [],
      telemetry: { ...baseTelemetry, path: "no_context", total_ms: Date.now() - startedAt },
    };
  }

  const kbContextStr = hits
    .map((h, i) => `[#${i + 1}] (source: ${h.title})\n${h.text}`)
    .join("\n\n");

  const context = vacBlock
    ? kbContextStr
      ? `${vacBlock}\n\n${kbContextStr}`
      : vacBlock
    : kbContextStr;

  const contextForPrompt =
    input.style && !context
      ? "АКТУАЛЬНЫЕ ВАКАНСИИ: нет данных. Конкретных вакансий, зарплат и городов сейчас нет в базе — не называй никаких цифр и мест."
      : context;

  let systemPrompt: string;
  let temperature = legacyRagSamplingTemperature(activePersona);
  if (input.style) {
    const stage: FunnelStage = input.stage ?? "qualify";
    systemPrompt = composeSystemPrompt(input.style, stage, contextForPrompt, {
      includeFewShot: input.includeFewShot ?? true,
      ...(input.userFacts ? { userFacts: input.userFacts } : {}),
      ...(input.conversationSummary ? { conversationSummary: input.conversationSummary } : {}),
      ...(input.skills && input.skills.length > 0 ? { skills: input.skills } : {}),
    });
    temperature = input.style.model.temperature;
  } else {
    systemPrompt = buildSystemPrompt(
      input.persona ?? DEFAULT_PERSONA,
      context,
      input.userFacts,
      input.conversationSummary,
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(input.history ?? []),
    { role: "user", content: input.question },
  ];

  console.log(`[rag] calling LLM (hits=${hits.length} vacBlock=${vacBlock.length > 0})`);
  const generationStart = Date.now();
  const numPredict = input.numPredict ?? input.style?.model.maxTokens;
  const raw = await input.chat.complete(messages, {
    temperature,
    ...(numPredict !== undefined ? { numPredict } : {}),
  });
  const text = sanitizeLlmOutput(raw);
  const generationMs = Date.now() - generationStart;

  const telemetry: AnswerTelemetry = { ...baseTelemetry, generation_ms: generationMs };

  const runVacancyCheck = vacBlock.length > 0 && input.vacancyGuard !== false;
  const runFactCheck =
    (input.reflect || runVacancyCheck) && text !== NO_CONTEXT_MARKER && text.trim().length > 0;

  if (runFactCheck) {
    const verdict = await checkFacts({
      question: input.question,
      answer: text,
      context,
      chat: input.chat,
      ...(runVacancyCheck ? { vacanciesBlock: vacBlock } : {}),
    });
    telemetry.factCheck = {
      grounded: verdict.grounded,
      vacancyOk: verdict.vacancyOk,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
    };

    if (!verdict.grounded) {
      console.warn(
        `[fact-checker] dropping ungrounded answer: ${verdict.reason ?? "unknown"} | answer="${text.slice(0, 120)}"`,
      );
      return {
        text: NO_CONTEXT_MARKER,
        usedChunkIds: hits.map((h) => h.chunk_id),
        hits,
        telemetry: { ...telemetry, path: "ungrounded", total_ms: Date.now() - startedAt },
      };
    }

    if (!verdict.vacancyOk) {
      console.warn(
        `[fact-checker] dropping answer with mismatched vacancy data: ${verdict.reason ?? "unknown"} | answer="${text.slice(0, 120)}"`,
      );
      return {
        text: NO_CONTEXT_MARKER,
        usedChunkIds: hits.map((h) => h.chunk_id),
        hits,
        telemetry: { ...telemetry, path: "ungrounded", total_ms: Date.now() - startedAt },
      };
    }
  }

  if (text === NO_CONTEXT_MARKER) {
    telemetry.path = "no_context";
  }

  return {
    text,
    usedChunkIds: hits.map((h) => h.chunk_id),
    hits,
    telemetry: { ...telemetry, total_ms: Date.now() - startedAt },
  };
}

export async function answerWithRag(input: AnswerInput): Promise<AnswerResult> {
  const startedAt = Date.now();
  const activePersona: Persona =
    input.style != null
      ? {
          name: input.style.persona.name,
          role: input.style.persona.role,
          ...(input.style.persona.company != null && input.style.persona.company.trim() !== ""
            ? { company: input.style.persona.company.trim() }
            : {}),
        }
      : (input.persona ?? DEFAULT_PERSONA);

  console.log(
    `[rag] answerWithRag style=${input.style?.slug ?? "none"} stage=${input.stage ?? "none"} q="${input.question.slice(0, 60)}"`,
  );

  if (isPersonaSmalltalkQuestion(input.question)) {
    return {
      text: applyStyleRules(personaSmalltalkReply(activePersona)),
      usedChunkIds: [],
      hits: [],
      telemetry: { path: "smalltalk", total_ms: Date.now() - startedAt },
    };
  }

  if (isBotPresenceQuestion(input.question)) {
    return {
      text: applyStyleRules(botPresenceReply(activePersona)),
      usedChunkIds: [],
      hits: [],
      telemetry: { path: "smalltalk", total_ms: Date.now() - startedAt },
    };
  }

  const factKey = isPersonalFactQuestion(input.question);
  if (factKey) {
    const factReply = personaFactReply(activePersona, factKey);
    if (factReply) {
      return {
        text: applyStyleRules(factReply),
        usedChunkIds: [],
        hits: [],
        telemetry: { path: "persona_fact", total_ms: Date.now() - startedAt },
      };
    }
  }

  const topK = input.topK ?? 5;

  const searchQuery = input.rewriteQueryBeforeRetrieval
    ? await rewriteQuery({
        question: input.question,
        ...(input.history ? { history: input.history } : {}),
        chat: input.chat,
      })
    : input.question;

  const retrievalStart = Date.now();
  const [questionVec] = await input.embedder.embed([searchQuery]);
  if (!questionVec) throw new Error("Embedder returned no vector for question");

  if (input.booksPriority) {
    const allHits = await input.kb.prioritySearch({
      embedding: questionVec,
      query: searchQuery,
      k: topK,
      vectorOnly: !input.hybridSearch,
    });
    const hits =
      input.hybridSearch || input.maxDistance === undefined
        ? allHits
        : allHits.filter((h) => h.distance <= input.maxDistance!);
    const retrievalMs = Date.now() - retrievalStart;
    const baseTelemetry: AnswerTelemetry = {
      path: "ok",
      retrieval_ms: retrievalMs,
      top_distances: hits.map((h) => Math.round(h.distance * 10000) / 10000),
      ...(input.hybridSearch ? { hybrid: true } : {}),
      ...(searchQuery !== input.question
        ? { original_query: input.question, rewritten_query: searchQuery }
        : {}),
    };
    return answerFromHits({ hits, baseTelemetry, startedAt, input, activePersona });
  }

  const topic = input.topicRouting ? classifyTopic(input.question) : null;

  const runSearch = (filterTopic: string | null) =>
    input.hybridSearch
      ? input.kb.hybridSearch({
          embedding: questionVec,
          query: searchQuery,
          k: topK,
          ...(filterTopic !== null ? { topic: filterTopic } : {}),
        })
      : input.kb.search(questionVec, topK, filterTopic);

  let allHits = await runSearch(topic);
  let usedTopic: string | null = topic;
  if (topic !== null && allHits.length === 0) {
    allHits = await runSearch(null);
    usedTopic = null;
  }
  const hits =
    input.hybridSearch || input.maxDistance === undefined
      ? allHits
      : allHits.filter((h) => h.distance <= input.maxDistance!);
  const retrievalMs = Date.now() - retrievalStart;

  const baseTelemetry: AnswerTelemetry = {
    path: "ok",
    retrieval_ms: retrievalMs,
    top_distances: hits.map((h) => Math.round(h.distance * 10000) / 10000),
    ...(input.hybridSearch ? { hybrid: true } : {}),
    ...(input.topicRouting && topic !== null ? { topic: usedTopic } : {}),
    ...(searchQuery !== input.question
      ? { original_query: input.question, rewritten_query: searchQuery }
      : {}),
  };

  console.log(
    `[rag] retrieval hits=${hits.length} topic=${usedTopic ?? "global"} ms=${Date.now() - retrievalStart}`,
  );
  return answerFromHits({ hits, baseTelemetry, startedAt, input, activePersona });
}
