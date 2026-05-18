export function createLogger(module: string, accountId: string = 'system') {
  const prefix = `[${module}:${accountId || 'system'}]`;

  return {
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}
