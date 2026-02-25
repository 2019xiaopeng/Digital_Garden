import { getSettings } from "../lib/settings";

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  messages: OpenAIChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

const SILICONFLOW_ENDPOINT = "https://api.siliconflow.cn/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V3.2";
const MODEL_ALIASES: Record<string, string> = {
  "deepseek-v3": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-v3.2": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-chat": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-r1": "deepseek-ai/DeepSeek-R1",
};

function resolveApiKey(): string {
  const settings = getSettings();
  const fromSettings = settings.aiApiKey?.trim();
  if (fromSettings) return fromSettings;

  const legacy = localStorage.getItem("eva.ai.api.key")?.trim();
  if (legacy) return legacy;

  const legacy2 = localStorage.getItem("eva.ai.apiKey")?.trim();
  return legacy2 || "";
}

function normalizeModelName(input?: string): string {
  const raw = (input || "").trim();
  if (!raw) return DEFAULT_MODEL;

  const alias = MODEL_ALIASES[raw.toLowerCase()];
  if (alias) return alias;

  return raw;
}

function resolveModel(model?: string): string {
  const explicit = normalizeModelName(model);
  if (model?.trim()) return explicit;

  const fromStorage = normalizeModelName(localStorage.getItem("eva.ai.model") || "");

  if (!localStorage.getItem("eva.ai.model") || localStorage.getItem("eva.ai.model") !== fromStorage) {
    localStorage.setItem("eva.ai.model", fromStorage);
  }

  return fromStorage || DEFAULT_MODEL;
}

export async function* chatCompletion(options: ChatCompletionOptions): AsyncGenerator<string, void, unknown> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error("未配置 SiliconFlow API Key，请先前往设置页保存。");
  }

  const response = await fetch(SILICONFLOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolveModel(options.model),
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`SiliconFlow 请求失败 (${response.status}): ${errText || response.statusText}`);
  }

  if (!response.body) {
    throw new Error("SiliconFlow 返回为空（无可读流）");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || !line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        return;
      }

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        continue;
      }
    }
  }
}

export async function chatCompletionToText(options: ChatCompletionOptions): Promise<string> {
  let out = "";
  for await (const chunk of chatCompletion(options)) {
    out += chunk;
  }
  return out;
}
