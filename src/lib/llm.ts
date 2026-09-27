import { z } from "zod";

/**
 * The single place the app talks to a language model.
 *
 * DeepSeek speaks the OpenAI chat-completions dialect. It does NOT support
 * strict `json_schema` response formats, and its models are reasoning models
 * that reject a forced `tool_choice`. So structured output is done the honest
 * way: ask for `json_object` (which guarantees syntactically valid JSON),
 * describe the shape in the prompt, then validate with Zod and retry once with
 * the validation error fed back.
 *
 * Swapping providers means rewriting this file and nothing else.
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

/** The careful model. Used for anything a person will read. */
export const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
/** The cheap model, for mechanical passes over long input. */
export const MODEL_FAST = process.env.DEEPSEEK_MODEL_FAST ?? "deepseek-flash";

function apiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY ?? "";
  if (!key) {
    throw new Error(
      "No DEEPSEEK_API_KEY. Put it in .env.local and restart the server.",
    );
  }
  return key;
}

type Message = { role: "system" | "user" | "assistant"; content: string };

type ChatResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  error?: { message?: string };
};

async function chat(
  messages: Message[],
  model: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      // Reasoning tokens come out of this budget, so keep it generous - a tight
      // cap returns an empty string rather than an error.
      max_tokens: maxTokens,
    }),
  });

  const body = (await res.json()) as ChatResponse;

  if (!res.ok) {
    throw new Error(
      `DeepSeek ${res.status}: ${body.error?.message ?? "request failed"}`,
    );
  }

  const choice = body.choices?.[0];
  const content = choice?.message?.content ?? "";
  if (!content.trim()) {
    throw new Error(
      choice?.finish_reason === "length"
        ? "Model hit the token limit before answering. Raise maxTokens."
        : "Model returned an empty response.",
    );
  }
  return content;
}

function schemaBlock(schema: z.ZodType, name: string): string {
  const json = z.toJSONSchema(schema, { io: "output" });
  return [
    `Reply with a single JSON object and nothing else - no prose, no markdown`,
    `fence. It must validate against this JSON Schema ("${name}"):`,
    "",
    JSON.stringify(json, null, 2),
    "",
    `Every required field must be present. Use an empty array or an empty`,
    `string rather than omitting a field or writing null.`,
  ].join("\n");
}

/** Strip a ```json fence if the model adds one despite being told not to. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function complete<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
  model?: string;
  /**
   * Language for every human-readable string in the output. Without this the
   * model answers in whatever language the prompt happens to be written in,
   * which is English - and the people reading this do not necessarily read it.
   */
  outputLanguage?: string;
}): Promise<T> {
  const { system, user, schema, schemaName } = opts;
  const model = opts.model ?? MODEL;
  const maxTokens = opts.maxTokens ?? 16000;

  const language = opts.outputLanguage
    ? `\n\nWrite every human-readable string in the output in ${opts.outputLanguage}, whatever language these instructions are in. Field names stay exactly as the schema gives them.`
    : "";

  const messages: Message[] = [
    {
      role: "system",
      content: `${system}\n\n${schemaBlock(schema, schemaName)}${language}`,
    },
    { role: "user", content: user },
  ];

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(messages, model, maxTokens);

    let parsed: unknown;
    try {
      parsed = JSON.parse(unfence(raw));
    } catch {
      lastError = "That was not valid JSON.";
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: `${lastError} Reply again, JSON only.` });
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;

    lastError = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `That JSON did not match the schema: ${lastError}. Reply again with corrected JSON only.`,
    });
  }

  throw new Error(`Model could not produce valid output: ${lastError}`);
}
