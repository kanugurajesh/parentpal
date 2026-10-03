export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  /** Ask the provider for a single JSON object. */
  json?: boolean;
  /**
   * Deterministic output used by the mock provider. Every call site supplies one, so the
   * whole app (and the test suite) runs end-to-end with no API key and no network.
   */
  mock: () => string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResult extends LLMUsage {
  text: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LLMRequest): Promise<LLMResult>;
  /** Yields text deltas; resolves usage once the stream is finished. */
  stream(req: LLMRequest): { deltas: AsyncIterable<string>; usage: Promise<LLMUsage> };
}

export interface CallContext {
  purpose: "chat_answer" | "chat_clarify" | "moment_tag" | "pattern" | "daily_tip" | "eval_judge" | "community_moderation" | "community_guide";
  userId?: string | null;
}
