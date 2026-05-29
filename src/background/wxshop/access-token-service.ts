import axios from 'axios';
import type { Config } from '../../shared/types';
import { normalizeExternalRequestError } from '../errors/external-error.ts';
import { getConfig } from '../store/account-repository';
import { readStore, writeStore, type StoredWxAccessToken } from '../store/core';

const BASE_URL = 'https://api.weixin.qq.com';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

const memoryCache = new Map<string, StoredWxAccessToken>();
const refreshPromises = new Map<string, Promise<string>>();
let cacheGeneration = 0;

function assertValidConfig(config: Config): void {
  if (!config.appId || !config.appSecret) {
    throw new Error('[CREDENTIAL] 请先配置 AppID 和 AppSecret');
  }
}

function isTokenFresh(token: StoredWxAccessToken | undefined, appId: string): token is StoredWxAccessToken {
  return !!token && token.appId === appId && token.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

function toCredentialError(errcode: number, errmsg?: string): Error {
  if (errcode === 40001) {
    return new Error('[CREDENTIAL] AppSecret 不正确或已失效，请前往店铺管理更新配置');
  }
  if (errcode === 42001) {
    return new Error('[CREDENTIAL] access_token 已过期，请前往店铺管理更新配置');
  }
  return new Error(errmsg || `获取 token 失败: ${errcode}`);
}

async function readStoredToken(accountId: string, appId: string): Promise<StoredWxAccessToken | undefined> {
  const stored = (await readStore()).wxAccessTokens?.[accountId];
  if (!isTokenFresh(stored, appId)) return undefined;
  memoryCache.set(accountId, stored);
  return stored;
}

async function persistToken(token: StoredWxAccessToken, generation: number): Promise<void> {
  if (generation !== cacheGeneration) return;
  const store = await readStore();
  if (generation !== cacheGeneration) return;
  await writeStore({
    wxAccessTokens: {
      ...(store.wxAccessTokens || {}),
      [token.accountId]: token,
    },
  });
}

async function requestNewToken(accountId: string, config: Config, generation: number): Promise<string> {
  assertValidConfig(config);
  const now = Date.now();
  let response;
  try {
    response = await axios.get(`${BASE_URL}/cgi-bin/token`, {
      params: {
        grant_type: 'client_credential',
        appid: config.appId,
        secret: config.appSecret,
      },
    });
  } catch (error) {
    throw normalizeExternalRequestError(error, {
      service: '微信小店',
      method: 'GET',
      path: '/cgi-bin/token',
      stage: '获取微信接口 access_token',
    });
  }
  const data = response.data;

  if (data.errcode) {
    memoryCache.delete(accountId);
    throw toCredentialError(data.errcode, data.errmsg);
  }

  const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 7200;
  const token: StoredWxAccessToken = {
    accountId,
    appId: config.appId,
    accessToken: data.access_token,
    expiresAt: now + expiresInSeconds * 1000,
    updatedAt: now,
  };
  if (generation === cacheGeneration) {
    memoryCache.set(accountId, token);
    await persistToken(token, generation);
  }
  return token.accessToken;
}

export async function getAccessToken(accountId: string, forceRefresh = false): Promise<string> {
  const config = await getConfig(accountId);
  assertValidConfig(config);

  if (!forceRefresh) {
    const memoryToken = memoryCache.get(accountId);
    if (isTokenFresh(memoryToken, config.appId)) return memoryToken.accessToken;

    const storedToken = await readStoredToken(accountId, config.appId);
    if (storedToken) return storedToken.accessToken;
  }

  const existingRefresh = refreshPromises.get(accountId);
  if (existingRefresh) return existingRefresh;

  const generation = cacheGeneration;
  const refresh = requestNewToken(accountId, config, generation).finally(() => {
    refreshPromises.delete(accountId);
  });
  refreshPromises.set(accountId, refresh);
  return refresh;
}

export async function removeAccessToken(accountId: string): Promise<void> {
  cacheGeneration++;
  memoryCache.delete(accountId);
  refreshPromises.delete(accountId);
  const store = await readStore();
  if (!store.wxAccessTokens?.[accountId]) return;
  const next = { ...store.wxAccessTokens };
  delete next[accountId];
  await writeStore({ wxAccessTokens: next });
}

export async function clearAccessTokens(): Promise<void> {
  cacheGeneration++;
  memoryCache.clear();
  refreshPromises.clear();
  await writeStore({ wxAccessTokens: {} });
}

export function isAccessTokenInvalidError(errcode: unknown): boolean {
  return errcode === 40001 || errcode === 40014 || errcode === 41001 || errcode === 42001;
}
