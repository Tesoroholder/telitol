import { env } from "@/lib/env.server";

/**
 * OpenAI-compatible chat providers for TeliTol AI, in the order we try them.
 * Free tiers first: Groq (console.groq.com) and Google AI Studio (Gemini).
 * Any provider whose key is set joins the chain; if one fails or is rate
 * limited, the next one answers. Model ids can be overridden per provider.
 */
type Provider = {
  name: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  endpoint: string;
};

const PROVIDERS: Provider[] = [
  {
    name: "groq",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
  },
  {
    name: "gemini",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  },
  {
    name: "openai",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4.1-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
  },
  {
    name: "xai",
    keyEnv: "XAI_API_KEY",
    modelEnv: "XAI_MODEL",
    defaultModel: "grok-3-mini",
    endpoint: "https://api.x.ai/v1/chat/completions",
  },
];

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type CompletionResult =
  { ok: true; text: string } | { ok: false; error: string };

export const NO_PROVIDER_ERROR =
  "AI isn't set up yet. Add GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY (free at aistudio.google.com) to the server environment.";

/** Configured providers, in fallback order. */
export function configuredProviders(): (Provider & {
  apiKey: string;
  model: string;
})[] {
  return PROVIDERS.flatMap((provider) => {
    const apiKey = env(provider.keyEnv);
    if (!apiKey) return [];
    return [
      {
        ...provider,
        apiKey,
        model: env(provider.modelEnv) ?? provider.defaultModel,
      },
    ];
  });
}

/** Ask each configured provider in turn until one answers. */
export async function complete(
  messages: ChatMessage[],
): Promise<CompletionResult> {
  const providers = configuredProviders();
  if (providers.length === 0) return { ok: false, error: NO_PROVIDER_ERROR };

  for (const provider of providers) {
    try {
      const res = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 600,
          temperature: 0.6,
          messages,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(
          `[ai] ${provider.name} returned ${res.status}:`,
          detail.slice(0, 300),
        );
        continue;
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) return { ok: true, text: text.slice(0, 4000) };
      console.error(`[ai] ${provider.name} returned an empty answer`);
    } catch (error) {
      console.error(
        `[ai] ${provider.name} failed:`,
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
  return {
    ok: false,
    error: "AI couldn't answer just now. Try again in a moment.",
  };
}
