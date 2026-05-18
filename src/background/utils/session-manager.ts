export interface Session<T = unknown> {
  state: T;
  controller: AbortController;
  cleanup: () => void;
}

export class SessionManager<T = unknown> {
  private sessions = new Map<string, Session<T>>();

  start(sessionId: string, state: T, cleanup?: () => void): AbortSignal {
    const controller = new AbortController();
    this.sessions.set(sessionId, {
      state,
      controller,
      cleanup: cleanup || (() => {}),
    });
    return controller.signal;
  }

  stop(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.controller.abort();
      session.cleanup();
      this.sessions.delete(sessionId);
    }
  }

  complete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cleanup();
      this.sessions.delete(sessionId);
    }
  }

  get(sessionId: string): Session<T> | undefined {
    return this.sessions.get(sessionId);
  }
}
