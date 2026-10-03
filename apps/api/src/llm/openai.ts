import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResult, LLMUsage } from "./types";

export interface OpenAIProviderOptions {
  /** Logged as the provider name; lets OpenAI-compatible hosts (e.g. "groq") show up separately. */
  name?: string;
  /** Sent as `reasoning_effort` (e.g. "low" for Groq's gpt-oss models to cut latency). */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  /** Added to each call's token cap so reasoning tokens don't eat the visible answer. */
  thinkingHeadroom?: number;
}

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
    private readonly opts: OpenAIProviderOptions = {},
  ) {
    this.name = opts.name ?? "openai";
    this.client = new OpenAI({ apiKey, baseURL: baseURL || undefined, timeout: 60_000, maxRetries: 2 });
  }

  private toMessages(req: LLMRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    return [{ role: "system", content: req.system }, ...req.messages];
  }

  private limits(req: LLMRequest) {
    return {
      max_completion_tokens: (req.maxTokens ?? 800) + (this.opts.thinkingHeadroom ?? 0),
      ...(this.opts.reasoningEffort ? { reasoning_effort: this.opts.reasoningEffort } : {}),
    };
  }

  async complete(req: LLMRequest): Promise<LLMResult> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toMessages(req),
      ...this.limits(req),
      ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    return {
      text: res.choices[0]?.message?.content ?? "",
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
  }

  stream(req: LLMRequest) {
    let resolveUsage!: (u: LLMUsage) => void;
    let rejectUsage!: (e: unknown) => void;
    const usage = new Promise<LLMUsage>((res, rej) => {
      resolveUsage = res;
      rejectUsage = rej;
    });
    // Avoid unhandled-rejection noise if the caller only awaits deltas.
    usage.catch(() => {});

    const client = this.client;
    const model = this.model;
    const messages = this.toMessages(req);
    const limits = this.limits(req);

    async function* deltas() {
      try {
        const stream = await client.chat.completions.create({
          model,
          messages,
          ...limits,
          stream: true,
          stream_options: { include_usage: true },
        });
        let u: LLMUsage = { inputTokens: 0, outputTokens: 0 };
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) yield text;
          // OpenAI puts usage on the final chunk; Groq may report it under `x_groq.usage` instead.
          const cu = chunk.usage ?? (chunk as { x_groq?: { usage?: OpenAI.CompletionUsage } }).x_groq?.usage;
          if (cu) u = { inputTokens: cu.prompt_tokens, outputTokens: cu.completion_tokens };
        }
        resolveUsage(u);
      } catch (err) {
        rejectUsage(err);
        throw err;
      }
    }
    return { deltas: deltas(), usage };
  }
}
