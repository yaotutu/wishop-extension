const CREDENTIAL_PREFIX = '[CREDENTIAL] ';

export function isCredentialError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(CREDENTIAL_PREFIX);
}

export function getCredentialMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith(CREDENTIAL_PREFIX)) {
    return error.message.slice(CREDENTIAL_PREFIX.length);
  }
  return '凭证无效，请检查 AppID 和 AppSecret 配置';
}
