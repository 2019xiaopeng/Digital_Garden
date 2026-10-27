// A2-P0-1: AI 厂商统一注册表。全部为 OpenAI 兼容协议，复用既有 SSE 解析与多模态管线，零新依赖。
// 新增厂商 = 在此数组加一条目，设置页自动出现，无需改任何调用代码。

export type VendorCapabilities = {
  streaming: boolean;
  vision: boolean;
  webSearch: boolean;
};

export type AiVendor = {
  id: string;
  name: string;
  /** OpenAI 兼容 base（请求地址为 `${baseUrl}/chat/completions`） */
  baseUrl: string;
  defaultModel: string;
  models: string[];
  visionModels: string[];
  capabilities: VendorCapabilities;
  keyUrl: string;
};

export const AI_VENDORS: AiVendor[] = [
  {
    id: "siliconflow",
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3.2",
    models: ["deepseek-ai/DeepSeek-V3.2", "deepseek-ai/DeepSeek-R1"],
    visionModels: ["Pro/Qwen/Qwen2.5-VL-7B-Instruct", "Pro/OpenGVLab/InternVL2.5-26B"],
    capabilities: { streaming: true, vision: true, webSearch: false },
    keyUrl: "https://cloud.siliconflow.cn",
  },
  {
    id: "deepseek",
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    visionModels: [],
    capabilities: { streaming: true, vision: false, webSearch: false },
    keyUrl: "https://platform.deepseek.com",
  },
  {
    id: "glm",
    name: "GLM（智谱）",
    // shortcut: 端点/模型名以官方文档为准，首次使用请点「测试连接」验证，变动只改这一行
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4.6",
    models: ["glm-4.6", "glm-4.5-air", "glm-4.5-flash"],
    visionModels: ["glm-4.5v"],
    capabilities: { streaming: true, vision: true, webSearch: true },
    keyUrl: "https://open.bigmodel.cn",
  },
  {
    id: "moonshot",
    name: "Kimi（月之暗面）",
    // shortcut: 模型名随厂商产品线更新，过期只改下面的列表
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2-turbo-preview",
    models: ["kimi-k2-turbo-preview", "kimi-k2-0905-preview"],
    visionModels: [],
    capabilities: { streaming: true, vision: false, webSearch: false },
    keyUrl: "https://platform.moonshot.cn",
  },
  {
    id: "minimax",
    name: "MiniMax",
    // shortcut: 端点待首次「测试连接」验证，若厂商调整路径只需改这一行
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-M2",
    models: ["MiniMax-M2"],
    visionModels: [],
    capabilities: { streaming: true, vision: false, webSearch: false },
    keyUrl: "https://platform.minimaxi.com",
  },
];

export const DEFAULT_VENDOR_ID = "siliconflow";
export const DEFAULT_VISION_VENDOR_ID = "siliconflow";

export function getVendor(id: string | undefined): AiVendor {
  return AI_VENDORS.find((vendor) => vendor.id === id) || AI_VENDORS[0];
}

/** 当前厂商的密钥（空串 = 未配置） */
export function getVendorKey(vendorId: string | undefined, keys: Record<string, string> | undefined): string {
  return (keys || {})[getVendor(vendorId).id]?.trim() || "";
}
