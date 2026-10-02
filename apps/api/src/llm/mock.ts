import type { LLMProvider, LLMRequest, LLMResult } from "./types";

/** Rough token estimate (~4 chars/token) so cost logging has realistic-looking numbers in mock mode. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "mock-template-v1";

  constructor(private delayMs = 0) {}

  private usageFor(req: LLMRequest, text: string) {
    const prompt = req.system + req.messages.map((m) => m.content).join("\n");
    return { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(text) };
  }

  async complete(req: LLMRequest): Promise<LLMResult> {
    const text = req.mock();
    return { text, ...this.usageFor(req, text) };
  }

  stream(req: LLMRequest) {
    const text = req.mock();
    const delay = this.delayMs;
    async function* deltas() {
      // Word-sized chunks so the client-side streaming UI is exercised realistically.
      for (const piece of text.match(/\S+\s*/g) ?? []) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        yield piece;
      }
    }
    return { deltas: deltas(), usage: Promise.resolve(this.usageFor(req, text)) };
  }
}
