import axios from 'axios';
import type { ActivityLogDomain } from '../../../shared/activity-log.ts';
import { createExternalApiError, normalizeExternalRequestError } from '../../errors/external-error.ts';
import { createDiagnosticLogger } from '../../logging/diagnostic-logger.ts';
import { getAccessToken, isAccessTokenInvalidError, removeAccessToken } from '../access-token-service.ts';
import { appendAccessTokenToWxPath } from './request-url.ts';

interface WxShopRequestClientOptions {
  accountId: string;
  domain: ActivityLogDomain;
  component: string;
}

type WxShopHttpMethod = 'GET' | 'POST';

/**
 * 微信小店接口的唯一 HTTP 入口。
 *
 * 业务模块只能声明 path、body 和返回值解析，不允许自己拼接 access_token。
 * 这里集中处理 token 获取、token 失效重试、网络错误归一化和微信业务错误抛出。
 */
export function createWxShopRequestClient(options: WxShopRequestClientOptions) {
  const { accountId, domain, component } = options;
  const logger = createDiagnosticLogger({ domain, component, accountId });

  function throwWxApiError(
    path: string,
    stage: string,
    data: { errcode?: number; errmsg?: string },
    method: WxShopHttpMethod = 'POST',
  ): never {
    throw createExternalApiError({
      service: '微信小店',
      method,
      path,
      stage,
    }, Number(data.errcode), data.errmsg || `${stage}失败`);
  }

  async function send<T>(method: WxShopHttpMethod, path: string, body: unknown, stage: string): Promise<T> {
    const send = async (forceRefresh = false) => {
      const token = await getAccessToken(accountId, forceRefresh);
      const url = appendAccessTokenToWxPath(path, token);
      let response;
      try {
        response = method === 'GET' ? await axios.get(url) : await axios.post(url, body);
      } catch (error) {
        throw normalizeExternalRequestError(error, {
          service: '微信小店',
          method,
          path,
          stage,
        });
      }
      return response.data as T & { errcode?: number };
    };

    const data = await send(false);
    if (!isAccessTokenInvalidError(data.errcode)) return data;

    await removeAccessToken(accountId);
    return send(true);
  }

  async function request<T>(path: string, body: unknown, stage: string): Promise<T> {
    return send<T>('POST', path, body, stage);
  }

  async function get<T>(path: string, stage: string): Promise<T> {
    return send<T>('GET', path, undefined, stage);
  }

  return {
    logger,
    get,
    request,
    throwWxApiError,
  };
}
