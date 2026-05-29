import axios from 'axios';

export type ExternalErrorKind = 'network' | 'timeout' | 'http' | 'api' | 'unknown';

export interface ExternalRequestContext {
  service: string;
  method?: string;
  path?: string;
  stage?: string;
}

export interface ExternalRequestErrorInit extends ExternalRequestContext {
  kind: ExternalErrorKind;
  message: string;
  code?: string | number;
  status?: number;
  requestId?: string;
  transient?: boolean;
}

export class ExternalRequestError extends Error {
  readonly kind: ExternalErrorKind;
  readonly service: string;
  readonly method?: string;
  readonly path?: string;
  readonly stage?: string;
  readonly code?: string | number;
  readonly status?: number;
  readonly requestId?: string;
  readonly transient: boolean;

  constructor(init: ExternalRequestErrorInit) {
    super(init.message);
    this.name = 'ExternalRequestError';
    this.kind = init.kind;
    this.service = init.service;
    this.method = init.method;
    this.path = init.path;
    this.stage = init.stage;
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.transient = init.transient ?? (init.kind === 'network' || init.kind === 'timeout');
  }
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const record = headers as Record<string, unknown>;
  const value = record[name] ?? record[name.toLowerCase()];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function isTimeoutCode(code?: string): boolean {
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
}

function normalizeMethod(method?: string): string | undefined {
  return method ? method.toUpperCase() : undefined;
}

function errorKindLabel(kind: ExternalErrorKind): string {
  if (kind === 'network') return '网络连接失败';
  if (kind === 'timeout') return '请求超时';
  if (kind === 'http') return 'HTTP 响应异常';
  if (kind === 'api') return '接口业务错误';
  return '未知错误';
}

export function normalizeExternalRequestError(error: unknown, context: ExternalRequestContext): ExternalRequestError {
  if (error instanceof ExternalRequestError) return error;

  if (axios.isAxiosError(error)) {
    const code = error.code;
    const status = error.response?.status ?? error.status;
    const requestId = headerValue(error.response?.headers, 'x-request-id') || headerValue(error.response?.headers, 'request-id');
    const method = normalizeMethod(context.method || error.config?.method);
    const base = {
      service: context.service,
      method,
      path: context.path,
      stage: context.stage,
      code,
      status,
      requestId,
    };

    if (isTimeoutCode(code) || /timeout/i.test(error.message)) {
      return new ExternalRequestError({
        ...base,
        kind: 'timeout',
        message: '请求超时',
        transient: true,
      });
    }

    if (error.response) {
      return new ExternalRequestError({
        ...base,
        kind: 'http',
        message: status ? `${context.service}接口 HTTP ${status}` : `${context.service}接口 HTTP 响应异常`,
        transient: status === undefined || status >= 500,
      });
    }

    if (error.request) {
      return new ExternalRequestError({
        ...base,
        kind: 'network',
        message: '网络连接失败',
        transient: true,
      });
    }
  }

  const message = error instanceof Error ? error.message : String(error || '未知错误');
  return new ExternalRequestError({
    ...context,
    method: normalizeMethod(context.method),
    kind: 'unknown',
    message,
    transient: false,
  });
}

export function createExternalApiError(
  context: ExternalRequestContext,
  code: number,
  message: string,
): ExternalRequestError {
  return new ExternalRequestError({
    ...context,
    method: normalizeMethod(context.method),
    kind: 'api',
    code,
    message: `${context.service}接口返回错误 ${code}：${message || '未知错误'}`,
    transient: false,
  });
}

export function formatExternalErrorDetail(error: ExternalRequestError): string {
  const parts = [
    error.stage ? `阶段：${error.stage}` : '',
    `服务：${error.service}`,
    error.path ? `接口：${[error.method, error.path].filter(Boolean).join(' ')}` : '',
    `错误类型：${errorKindLabel(error.kind)}`,
    error.status !== undefined ? `HTTP 状态：${error.status}` : '',
    error.code !== undefined ? `错误码：${error.code}` : '',
    error.requestId ? `请求 ID：${error.requestId}` : '',
    error.transient ? '建议：偶发通常可忽略，连续出现请检查本机网络、代理/VPN、DNS 或微信接口连通性' : '',
  ].filter(Boolean);
  return parts.join('；');
}

export function externalErrorMetadata(error: ExternalRequestError): Record<string, string | number | boolean> {
  const metadata: Record<string, string | number | boolean> = {
    service: error.service,
    errorKind: error.kind,
    transient: error.transient,
  };
  if (error.stage) metadata.stage = error.stage;
  if (error.method) metadata.method = error.method;
  if (error.path) metadata.endpoint = error.path;
  if (error.status !== undefined) metadata.httpStatus = error.status;
  if (error.code !== undefined) metadata.errorCode = error.code;
  if (error.requestId) metadata.requestId = error.requestId;
  return metadata;
}
