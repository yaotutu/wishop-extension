const CREDENTIAL_PREFIX = '[CREDENTIAL] ';
export const DELIVERY_COMPANY_UNMATCHED_PREFIX = '[DELIVERY_COMPANY_UNMATCHED] ';

export function isCredentialError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(CREDENTIAL_PREFIX);
}

export function getCredentialMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith(CREDENTIAL_PREFIX)) {
    return error.message.slice(CREDENTIAL_PREFIX.length);
  }
  return '凭证无效，请检查 AppID 和 AppSecret 配置';
}

export function isDeliveryCompanyUnmatchedError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(DELIVERY_COMPANY_UNMATCHED_PREFIX);
}

export function getDeliveryCompanyUnmatchedMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith(DELIVERY_COMPANY_UNMATCHED_PREFIX)) {
    return error.message.slice(DELIVERY_COMPANY_UNMATCHED_PREFIX.length);
  }
  return '无法自动匹配微信小店快递公司编码';
}
