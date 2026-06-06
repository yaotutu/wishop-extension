export type SiliconFlowChatRole = 'system' | 'user' | 'assistant';

export interface SiliconFlowChatMessage {
  role: SiliconFlowChatRole;
  content: string;
}

export interface SiliconFlowJsonCompletionInput {
  apiKey: string;
  model: string;
  messages: SiliconFlowChatMessage[];
  temperature?: number;
  maxTokens?: number;
  fetcher?: typeof fetch;
}

interface SiliconFlowCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const SILICON_FLOW_CHAT_COMPLETIONS_URL = 'https://api.siliconflow.cn/v1/chat/completions';

/**
 * SiliconFlow 请求由不同复制商品步骤复用，但每个步骤的用户提示不同。
 * 这里只统一 AbortController 接线，具体超时文案由调用方传入，避免日志里混淆是类目选择还是参数补齐。
 */
export function createSiliconFlowTimeoutFetcher(input: {
  timeoutMs: number;
  timeoutMessage: string;
}): typeof fetch {
  return async (request, init) => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      return await fetch(request, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(input.timeoutMessage);
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  };
}

function normalizeSecret(value: string): string {
  return value.trim();
}

function redactSecret(message: string, secret: string): string {
  const normalizedSecret = normalizeSecret(secret);
  if (!normalizedSecret) return message;
  return message.split(normalizedSecret).join('[redacted]');
}

function extractFencedJson(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return fenced?.[1]?.trim() || trimmed;
}

async function readResponseError(response: Response, apiKey: string): Promise<string> {
  try {
    const payload = await response.json() as {
      error?: { message?: string };
      message?: string;
      errmsg?: string;
    };
    const message = payload.error?.message || payload.message || payload.errmsg || response.statusText;
    return redactSecret(message, apiKey);
  } catch {
    return response.statusText || '未知错误';
  }
}

export function parseSiliconFlowJsonContent(content: string): unknown {
  try {
    return JSON.parse(extractFencedJson(content));
  } catch {
    throw new Error('SiliconFlow 返回的内容不是有效 JSON');
  }
}

export async function createSiliconFlowJsonCompletion(input: SiliconFlowJsonCompletionInput): Promise<unknown> {
  const apiKey = normalizeSecret(input.apiKey);
  const model = input.model.trim();
  if (!apiKey) throw new Error('请先在设置里填写 SiliconFlow API Key');
  if (!model) throw new Error('请先在设置里填写 SiliconFlow 模型名称');
  if (input.messages.length === 0) throw new Error('SiliconFlow 调用缺少消息内容');

  const fetcher = input.fetcher || fetch;
  const response = await fetcher(SILICON_FLOW_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      stream: false,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1200,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const message = await readResponseError(response, apiKey);
    throw new Error(`SiliconFlow API 调用失败（HTTP ${response.status}）：${message}`);
  }

  const payload = await response.json() as SiliconFlowCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('SiliconFlow 返回结果缺少 message.content');
  return parseSiliconFlowJsonContent(content);
}
