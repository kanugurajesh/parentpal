import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResult, LLMUsage } from "./types";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL: baseURL || undefined, timeout: 60_000, maxRetries: 2 });
  }

  private toMessages(req: LLMRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    return [{ role: "system", content: req.system }, ...req.messages];
  }

  async complete(req: LLMRequest): Promise<LLMResult> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toMessages(req),
      max_completion_tokens: req.maxTokens ?? 800,
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
    const maxTokens = req.maxTokens ?? 800;

    async function* deltas() {
      try {
        const stream = await client.chat.completions.create({
          model,
          messages,
          max_completion_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        });
        let u: LLMUsage = { inputTokens: 0, outputTokens: 0 };
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) yield text;
          if (chunk.usage) u = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
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
