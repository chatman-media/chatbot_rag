export type FetchLike = typeof fetch;

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionOpts {
  temperature?: number;
  /** Optional output-token cap (`num_predict` for Ollama, `max_tokens`
   *  for OpenAI). Implementations free to ignore or pick a default. */
  numPredict?: number;
}

export interface ChatClient {
  complete(messages: ChatMessage[], opts?: ChatCompletionOpts): Promise<string>;
  /**
   * Token-by-token streaming variant. Yields raw text chunks as they arrive.
   * Optional — callers should check `typeof client.stream === "function"` before
   * using, or fall back to `complete()`.
   */
  stream?(messages: ChatMessage[], opts?: ChatCompletionOpts): AsyncIterable<string>;
}

/** Parse OpenAI-compatible SSE stream, yielding text delta chunks. */
async function* parseOpenAiSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          // malformed SSE line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class ChatApiError extends Error {
  constructor(
    public statusCode: number,
    public description: string,
  ) {
    super(`Chat completion failed (${statusCode}): ${description}`);
    this.name = "ChatApiError";
  }
}

export interface OpenAIChatOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Per-request timeout in ms. Default 60_000 (1 min). */
  timeoutMs?: number;
  fetch?: FetchLike;
}

interface ChatResponse {
  choices?: Array<{
    index?: number;
    message?: { role: string; content: string };
  }>;
  error?: { message?: string };
}

export class OpenAIChatClient implements ChatClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(opts: OpenAIChatOptions) {
    if (!opts.apiKey) throw new Error("OpenAIChatClient: apiKey required");
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async complete(messages: ChatMessage[], opts: ChatCompletionOpts = {}): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.numPredict !== undefined) body.max_tokens = opts.numPredict;

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    let payload: ChatResponse;
    try {
      payload = (await res.json()) as ChatResponse;
    } catch {
      throw new ChatApiError(res.status, "non-JSON response");
    }
    if (!res.ok) {
      throw new ChatApiError(res.status, payload.error?.message ?? "unexpected error");
    }
    const first = payload.choices?.[0]?.message?.content;
    if (!first) {
      throw new ChatApiError(res.status, "no choices returned by model");
    }
    return first;
  }

  async *stream(messages: ChatMessage[], opts: ChatCompletionOpts = {}): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.numPredict !== undefined) body.max_tokens = opts.numPredict;

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new ChatApiError(res.status, err.error?.message ?? "stream request failed");
    }

    yield* parseOpenAiSseStream(res.body);
  }
}
