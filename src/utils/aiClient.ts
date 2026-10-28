import { getSettings } from "../lib/settings";
import { getVendor } from "../lib/vendors";

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
  /** 覆盖当前对话厂商（视觉链路用），缺省读 settings.aiVendorId */
  vendorId?: string;
  /** A1-P1-8: 请求厂商服务端联网搜索（仅能力位 webSearch=true 的厂商生效，如 GLM） */
  webSearch?: boolean;
};

const MODEL_ALIASES: Record<string, string> = {
  "deepseek-v3": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-v3.2": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-chat": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-r1": "deepseek-ai/DeepSeek-R1",
};

function normalizeModelName(input?: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  return MODEL_ALIASES[raw.toLowerCase()] || raw;
}

function resolveModel(model: string | undefined, fallback: string): string {
  return normalizeModelName(model) || fallback;
}

export function resolveVisionModel(): string {
  const settings = getSettings();
  const vendor = getVendor(settings.aiVisionVendorId);
  return settings.aiVisionModel?.trim() || vendor.visionModels[0] || "";
}

function resolveVisionMode(): "single" | "pipeline" {
  const settings = getSettings();
  const raw = settings.aiVisionMode?.trim().toLowerCase();
  if (raw === "pipeline") return "pipeline";
  return "single";
}

export async function* chatCompletion(options: ChatCompletionOptions): AsyncGenerator<string, void, unknown> {
  const settings = getSettings();
  const vendor = getVendor(options.vendorId || settings.aiVendorId);
  const apiKey = (settings.aiVendorKeys || {})[vendor.id]?.trim() || "";
  if (!apiKey) {
    throw new Error(`未配置 ${vendor.name} API Key，请先前往设置页保存。`);
  }

  const fallbackModel = options.vendorId
    ? (settings.aiVisionModel?.trim() || vendor.visionModels[0] || vendor.defaultModel)
    : (settings.aiModel?.trim() || vendor.defaultModel);

  const body: Record<string, unknown> = {
    model: resolveModel(options.model, fallbackModel),
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1024,
    stream: true,
  };
  if (options.webSearch && vendor.capabilities.webSearch) {
    body.tools = [{ type: "web_search", web_search: { enable: true, search_result: true } }];
  }

  const response = await fetch(`${vendor.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`${vendor.name} 请求失败 (${response.status}): ${errText || response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`${vendor.name} 返回为空（无可读流）`);
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
  /** A1-P1-7: 覆盖默认的错题解析模板（普通图片提问传自己的 systemPrompt） */
  systemPrompt?: string;
}): AsyncGenerator<string, void, unknown> {
  const imageBase64 = options.imageBase64?.trim();
  if (!imageBase64) {
    throw new Error("imageBase64 不能为空");
  }

  const mode = options.mode || resolveVisionMode();
  const visionModel = options.visionModel?.trim() || resolveVisionModel();
  const visionVendorId = getSettings().aiVisionVendorId;

  if (mode === "single") {
    const systemPrompt = options.systemPrompt || "你是一位考研辅导名师。请严格按以下格式输出：\n1) 第一行必须是：题型总结：<一句话，例如\"高数定积分计算\"/\"线代特征值计算\">。\n2) 然后给出题目原文（LaTeX）。\n3) 给出详细解答。若是数学题，至少给两种思路：主解法 + 备选思路（可简略对比优劣）。\n所有数学公式使用 LaTeX（行内 $...$，行间 $$...$$）。";
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
      vendorId: visionVendorId,
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
    vendorId: visionVendorId,
    messages: extractionMessages,
    temperature: 0.1,
    maxTokens: 1024,
    signal: options.signal,
  })) {
    extractedQuestion += chunk;
  }

  const cleaned = extractedQuestion.trim() || "（未成功提取题面，请用户补充文本）";
  yield `**【题目识别】**\n\n${cleaned}\n\n---\n\n**【详细解答】**\n\n`;

  const chatSettings = getSettings();
  const reasoningModel = resolveModel(
    options.reasoningModel,
    chatSettings.aiModel?.trim() || getVendor(chatSettings.aiVendorId).defaultModel,
  );
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
