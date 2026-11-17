/**
 * The little of the Chrome DevTools Protocol the smoke check needs, over Node's WebSocket: one
 * connection to the browser, with each page attached through it (flat sessions).
 */
export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

interface Pending {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: CdpEvent) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data)) as {
        id?: number;
        result?: Record<string, unknown>;
        error?: { message: string };
      } & CdpEvent;
      if (data.id === undefined) {
        for (const listener of this.listeners) listener(data);
        return;
      }
      const pending = this.pending.get(data.id);
      this.pending.delete(data.id);
      if (data.error) pending?.reject(new Error(data.error.message));
      else pending?.resolve(data.result ?? {});
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values())
        pending.reject(new Error('the DevTools connection closed'));
      this.pending.clear();
    });
  }

  static open(url: string): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => resolve(new CdpConnection(socket)), { once: true });
      socket.addEventListener('error', () => reject(new Error(`could not connect to ${url}`)), {
        once: true,
      });
    });
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  on(listener: (event: CdpEvent) => void): void {
    this.listeners.add(listener);
  }

  close(): void {
    this.socket.close();
  }
}

/**
 * Evaluates an expression in a page and returns its value, awaiting a promise. Throws what the
 * expression threw.
 */
export async function evaluate<T>(
  cdp: CdpConnection,
  sessionId: string,
  expression: string,
): Promise<T> {
  const result = (await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  )) as {
    result: { value?: T };
    exceptionDetails?: { exception?: { description?: string }; text: string };
  };
  if (result.exceptionDetails) {
    const { exception, text } = result.exceptionDetails;
    throw new Error(exception?.description ?? text);
  }
  return result.result.value as T;
}
