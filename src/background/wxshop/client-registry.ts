import { createWxShopClient, WxShopClient } from './client';
import { clearAccessTokens } from './access-token-service';

const clients = new Map<string, WxShopClient>();

export async function getClient(accountId: string): Promise<WxShopClient> {
  let client = clients.get(accountId);
  if (!client) {
    client = createWxShopClient(accountId);
    clients.set(accountId, client);
  }
  return client;
}

export function removeClient(accountId: string): void {
  clients.delete(accountId);
}

export function clearAll(): void {
  clients.clear();
  void clearAccessTokens();
}
