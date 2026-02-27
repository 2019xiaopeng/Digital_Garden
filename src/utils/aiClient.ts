import { getSettings } from "../lib/settings";

export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image_url"; image_url: { url: string } };
export type MessageContent = string | Array<TextContent | ImageContent>;

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: MessageContent;
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

const VISION_MODELS: Record<string, string> = {
  "qwen-vl-7b": "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
  "internvl-26b": "Pro/OpenGVLab/InternVL2.5-26B",
};

const DEFAULT_VISION_MODEL = "Pro/Qwen/Qwen2.5-VL-7B-Instruct";

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

export function resolveVisionModel(): string {
  const settings = getSettings();
  const fromSettings = settings.aiVisionModel?.trim();
  if (fromSettings) return fromSettings;
  const fromStorage = localStorage.getItem("eva.ai.visionModel")?.trim();
  return fromStorage || DEFAULT_VISION_MODEL;
}

function resolveVisionMode(): "single" | "pipeline" {
  const settings = getSettings();
  const raw = settings.aiVisionMode?.trim().toLowerCase();
  if (raw === "pipeline") return "pipeline";
  return "single";
}

function normalizeVisionModel(model?: string): string {
  const raw = (model || "").trim();
  if (!raw) return resolveVisionModel();
  return VISION_MODELS[raw.toLowerCase()] || raw;
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

export async function* visionChatCompletion(options: {
  imageBase64: string;
  userPrompt: string;
  visionModel?: string;
  reasoningModel?: string;
  mode?: "single" | "pipeline";
  signal?: AbortSignal;
}): AsyncGenerator<string, void, unknown> {
  const imageBase64 = options.imageBase64?.trim();
  if (!imageBase64) {
    throw new Error("imageBase64 不能为空");
  }

  const mode = options.mode || resolveVisionMode();
  const visionModel = normalizeVisionModel(options.visionModel);

  if (mode === "single") {
    const systemPrompt = "你是一位考研辅导名师。请严格按以下格式输出：\n1) 第一行必须是：题型总结：<一句话，例如\"高数定积分计算\"/\"线代特征值计算\">。\n2) 然后给出题目原文（LaTeX）。\n3) 给出详细解答。若是数学题，至少给两种思路：主解法 + 备选思路（可简略对比优劣）。\n所有数学公式使用 LaTeX（行内 $...$，行间 $$...$$）。";
    const messages: OpenAIChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: options.userPrompt?.trim() || "请识别图片中的题目并详细解答。",
          },
          {
            type: "image_url",
            image_url: { url: imageBase64 },
          },
        ],
      },
    ];

    for await (const chunk of chatCompletion({
      model: visionModel,
      messages,
      temperature: 0.3,
      maxTokens: 2048,
      signal: options.signal,
    })) {
      yield chunk;
    }
    return;
  }

  const extractionPrompt = "请仔细看图中的题目，精确提取题目全文。所有数学公式用 LaTeX 格式（行内 $...$，行间 $$...$$）。只输出题目内容，不要解题。";
  const extractionMessages: OpenAIChatMessage[] = [
    { role: "system", content: extractionPrompt },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: options.userPrompt?.trim() || "请识别题目原文",
        },
        {
          type: "image_url",
          image_url: { url: imageBase64 },
        },
      ],
    },
  ];

  let extractedQuestion = "";
  for await (const chunk of chatCompletion({
    model: visionModel,
    messages: extractionMessages,
    temperature: 0.1,
    maxTokens: 1024,
    signal: options.signal,
  })) {
    extractedQuestion += chunk;
  }

  const cleaned = extractedQuestion.trim() || "（未成功提取题面，请用户补充文本）";
  yield `**【题目识别】**\n\n${cleaned}\n\n---\n\n**【详细解答】**\n\n`;

  const reasoningModel = options.reasoningModel?.trim() || resolveModel("deepseek-ai/DeepSeek-R1");
  const solvingPrompt = "你是一位考研辅导名师。请严格按以下格式输出：\n1) 第一行必须是：题型总结：<一句话总结题目类型/知识点>。\n2) 然后给出完整详细解题步骤。\n3) 若为数学题，至少给两种思路：主解法 + 备选思路（可简述适用条件与优劣）。\n所有数学公式使用 LaTeX（行内 $...$，行间 $$...$$）。";
  const solvingMessages: OpenAIChatMessage[] = [
    { role: "system", content: solvingPrompt },
    {
      role: "user",
      content: `题目如下：\n\n${cleaned}`,
    },
  ];

  for await (const chunk of chatCompletion({
    model: reasoningModel,
    messages: solvingMessages,
    temperature: 0.5,
    maxTokens: 2048,
    signal: options.signal,
  })) {
    yield chunk;
  }
}
