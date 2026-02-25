import { getSettings } from "../lib/settings";

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  messages: ChatCompletionMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (delta: string, fullText: string) => void;
};

export type ChatCompletionResult = {
  content: string;
  model: string;
};

const SILICONFLOW_ENDPOINT = "https://api.siliconflow.cn/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V3.2";

export function getAiRuntimeConfig() {
  const settings = getSettings();
  const apiKey = settings.aiApiKey || localStorage.getItem("eva.ai.apiKey") || "";
  const model = settings.aiModel || localStorage.getItem("eva.ai.model") || DEFAULT_MODEL;
  return { apiKey, model };
}

function collectDeltaText(payload: any): string {
  const choice = payload?.choices?.[0];
  const delta = choice?.delta || {};
  const parts: string[] = [];

  if (typeof delta.reasoning_content === "string") {
    parts.push(delta.reasoning_content);
  }
  if (typeof delta.content === "string") {
    parts.push(delta.content);
  }

  return parts.join("");
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const runtime = getAiRuntimeConfig();
  const apiKey = runtime.apiKey;
  const model = options.model || runtime.model || DEFAULT_MODEL;

  if (!apiKey.trim()) {
    throw new Error("未配置 SiliconFlow API Key，请先到设置页填写。");
  }

  const response = await fetch(SILICONFLOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`SiliconFlow 请求失败（${response.status}）：${errText || response.statusText}`);
  }

  if (!response.body) {
    throw new Error("SiliconFlow 返回为空响应流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        return { content: fullText, model };
      }

      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }

      const deltaText = collectDeltaText(payload);
      if (!deltaText) continue;

      fullText += deltaText;
      options.onDelta?.(deltaText, fullText);
    }
  }

  return { content: fullText, model };
}
