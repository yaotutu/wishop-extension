const BASE_URL = 'https://api.weixin.qq.com';

export function appendAccessTokenToWxPath(path: string, token: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${BASE_URL}${path}${separator}access_token=${encodeURIComponent(token)}`;
}
