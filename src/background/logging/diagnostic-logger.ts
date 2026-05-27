import type { ActivityLogDomain } from '../../shared/activity-log';
import { writeConsoleLog, type ConsoleLogMethod } from './console-log-sink.ts';

export interface DiagnosticLoggerContext {
  domain: ActivityLogDomain;
  component: string;
  accountId?: string;
}

function formatPrefix(context: DiagnosticLoggerContext): string {
  const account = context.accountId || 'system';
  return `[diagnostic:${context.domain}:${context.component}:${account}]`;
}

function write(method: ConsoleLogMethod, context: DiagnosticLoggerContext, message: string, args: unknown[]): void {
  writeConsoleLog({
    method,
    args: [formatPrefix(context), message, ...args],
  });
}

export function createDiagnosticLogger(context: DiagnosticLoggerContext) {
  return {
    info: (message: string, ...args: unknown[]) => write('info', context, message, args),
    warn: (message: string, ...args: unknown[]) => write('warn', context, message, args),
    error: (message: string, ...args: unknown[]) => write('error', context, message, args),
  };
}
