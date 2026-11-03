/**
 * OpenAI-compatible providers people in mainland China actually buy keys from.
 *
 * Every base URL here is the one its maker documents for OpenAI-compatible clients, and every
 * model id exists in the bundled models.dev snapshot — a picked preset must chat on the first try,
 * so nothing is guessed.
 */
export interface CnProvider {
  id: string;
  /** The name its maker writes, in Latin script. */
  label: string;
  /** The name people here know it by. */
  alias: string;
  /** OpenAI-compatible base URL. */
  api: string;
  /** Where a person gets an API key. */
  keys: string;
  /** One model id that exists today, so the first message works before a model list arrives. */
  model: string;
}

export const CN_PROVIDERS: readonly CnProvider[] = [
  {
    id: "zhipu",
    label: "Zhipu GLM",
    alias: "智谱 GLM",
    api: "https://open.bigmodel.cn/api/paas/v4",
    keys: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    model: "glm-4.6",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen",
    alias: "通义千问",
    api: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keys: "https://bailian.console.aliyun.com/",
    model: "qwen-plus",
  },
  {
    id: "doubao",
    label: "ByteDance Doubao",
    alias: "豆包",
    api: "https://ark.cn-beijing.volces.com/api/v3",
    keys: "https://console.volcengine.com/ark",
    model: "doubao-seed-1-6-251015",
  },
  {
    id: "kimi",
    label: "Moonshot Kimi",
    alias: "月之暗面 Kimi",
    api: "https://api.moonshot.cn/v1",
    keys: "https://platform.moonshot.cn/console/api-keys",
    model: "kimi-k2.6",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    alias: "硅基流动",
    api: "https://api.siliconflow.cn/v1",
    keys: "https://cloud.siliconflow.cn/account/ak",
    model: "Pro/deepseek-ai/DeepSeek-V3.2",
  },
  {
    id: "minimax",
    label: "MiniMax",
    alias: "MiniMax",
    api: "https://api.minimaxi.com/v1",
    keys: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    model: "MiniMax-M2.5",
  },
  {
    id: "hunyuan",
    label: "Tencent Hunyuan",
    alias: "腾讯混元",
    api: "https://api.hunyuan.cloud.tencent.com/v1",
    keys: "https://console.cloud.tencent.com/hunyuan/api-key",
    model: "hunyuan-turbos-latest",
  },
  {
    id: "qianfan",
    label: "Baidu Qianfan",
    alias: "百度千帆",
    api: "https://qianfan.baidubce.com/v2",
    keys: "https://console.bce.baidu.com/qianfan/",
    model: "ernie-4.0-turbo-8k",
  },
];

export function cnProvider(id: string): CnProvider | undefined {
  return CN_PROVIDERS.find((provider) => provider.id === id);
}
