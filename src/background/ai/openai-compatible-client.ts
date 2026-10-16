export type OpenAiCompatibleChatRole = 'system' | 'user' | 'assistant';

export interface OpenAiCompatibleChatMessage {
  role: OpenAiCompatibleChatRole;
  content: string;
}

export interface OpenAiCompatibleJsonCompletionInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAiCompatibleChatMessage[];
  temperature?: number;
  maxTokens?: number;
  fetcher?: typeof fetch;
}

interface OpenAiCompatibleCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

/**
 * OpenAI 兼容服务只要求用户填写 API 根地址，例如 https://api.openai.com/v1。
 * 这里统一裁掉末尾斜杠，避免不同调用方重复处理 URL 拼接细节。
 */
function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/u, '');
}

function normalizeSecret(value: string): string {
  return value.trim();
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
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

/**
 * 不同 OpenAI 兼容服务可能把 JSON 包在 ```json fence 里。
 * 业务层只拿结构化对象，解析和错误归一化集中放在 AI 客户端。
 */
export function parseOpenAiCompatibleJsonContent(content: string): unknown {
  try {
    return JSON.parse(extractFencedJson(content));
  } catch {
    throw new Error('AI 服务返回的内容不是有效 JSON');
  }
}

/**
 * 超时控制由调用方传入具体文案，方便日志区分“类目选择”和“商品参数补齐”等不同业务场景。
 */
export function createOpenAiCompatibleTimeoutFetcher(input: {
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

export async function createOpenAiCompatibleJsonCompletion(
  input: OpenAiCompatibleJsonCompletionInput,
): Promise<unknown> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = normalizeSecret(input.apiKey);
  const model = input.model.trim();
  if (!baseUrl) throw new Error('请先在设置里填写 OpenAI 兼容地址');
  if (!apiKey) throw new Error('请先在设置里填写 AI 服务 API Key');
  if (!model) throw new Error('请先在设置里填写 AI 服务模型名称');
  if (input.messages.length === 0) throw new Error('AI 服务调用缺少消息内容');

  const fetcher = input.fetcher || fetch;
  const response = await fetcher(chatCompletionsUrl(baseUrl), {
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
    throw new Error(`AI 服务调用失败（HTTP ${response.status}）：${message}`);
  }

  const payload = await response.json() as OpenAiCompatibleCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 服务返回结果缺少 message.content');
  return parseOpenAiCompatibleJsonContent(content);
}
