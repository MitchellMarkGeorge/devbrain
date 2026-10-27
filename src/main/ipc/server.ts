import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC_CANCEL_CHANNEL, IPC_CHANNEL_PREFIX, RESERVED_SEGMENTS } from '@common/ipc/constants';
import { IpcError, serializeError } from '@common/ipc/errors';
import { isProcedure } from '@common/ipc/procedure';
import type {
  AnyProcedure,
  MiddlewareNext,
  MiddlewareResult,
  ProcedureType,
  RouterContext,
  RouterRecord,
} from '@common/ipc/procedure';
import type { IpcResult, SerializedError, StandardSchemaIssue } from '@common/ipc/types';
import { InvalidInputError } from '@main/core/shared/errors';

// Runs the router defined with initIpc (src/common/ipc/procedure.ts) behind ipcMain: one handler
// per procedure, on `ipc:<path>`, answering with an IpcResult envelope.

const SEGMENT_PATTERN = /^[a-zA-Z0-9_]+$/;

// A router's procedures by dotted path. Throws on a key the client can't call (a reserved name,
// one with characters the preload rejects, `cancel` at the top, which is the cancel channel) and
// on a path defined twice.
export function flatten(router: RouterRecord): Map<string, AnyProcedure> {
  const procedures = new Map<string, AnyProcedure>();
  const visit = (record: RouterRecord, prefix: string[]) => {
    for (const [key, value] of Object.entries(record)) {
      const path = [...prefix, key];
      const dotted = path.join('.');
      if (RESERVED_SEGMENTS.includes(key)) {
        throw new Error(`'${dotted}': '${key}' is reserved by the IPC client`);
      }
      if (!SEGMENT_PATTERN.test(key)) {
        throw new Error(`'${dotted}': a router key may only hold letters, digits and _`);
      }
      if (`${IPC_CHANNEL_PREFIX}${dotted}` === IPC_CANCEL_CHANNEL) {
        throw new Error(`'${dotted}' is the cancel channel`);
      }
      if (isProcedure(value)) {
        if (procedures.has(dotted)) throw new Error(`'${dotted}' is defined twice`);
        procedures.set(dotted, value);
      } else {
        visit(value, path);
      }
    }
  };
  visit(router, []);
  return procedures;
}

export interface IpcErrorInfo {
  path: string;
  type: ProcedureType;
  // what was thrown, before serializing: an `internal` one's details are only here
  error: unknown;
  serialized: SerializedError;
}

export interface AttachRouterOptions<TCtx extends RouterContext> {
  // read on every call
  createContext: (event: IpcMainInvokeEvent) => TCtx | Promise<TCtx>;
  // every failed call, to log; it never changes the response
  onError?: (info: IpcErrorInfo) => void;
  // checks each result can be sent (structuredClone) and fails naming the path if not, rather
  // than with Electron's own error. For development: it clones every result once more
  checkClone?: boolean;
}

// a validation failure: core's invalid_input, with the schema's issues in `data`
export class InputValidationError extends InvalidInputError {
  readonly issues: { message: string; path: (string | number)[] }[];

  constructor(issues: ReadonlyArray<StandardSchemaIssue>) {
    super(issues.length === 1 ? `Invalid input: ${issues[0].message}` : 'Invalid input');
    this.name = 'InputValidationError';
    // path segments may be symbols or { key } objects, which don't cross IPC
    this.issues = issues.map((issue) => ({
      message: issue.message,
      path: (issue.path ?? []).map((segment) => {
        const key = typeof segment === 'object' ? segment.key : segment;
        return typeof key === 'number' ? key : String(key);
      }),
    }));
  }
}

const CANCELLED_MESSAGE = 'The call was cancelled';

// Registers a handler per procedure and the cancel handler. Returns the function that removes them
// and aborts the calls still running.
export function attachRouter<TCtx extends RouterContext>(
  router: RouterRecord,
  options: AttachRouterOptions<TCtx>,
): () => void {
  const procedures = flatten(router);
  // calls in flight, by sender and request id: two windows' ids may collide
  const inFlight = new Map<string, AbortController>();
  const keyOf = (event: IpcMainInvokeEvent, requestId: string) => `${event.sender.id}:${requestId}`;

  const execute = async (
    path: string,
    procedure: AnyProcedure,
    event: IpcMainInvokeEvent,
    rawInput: unknown,
    requestId: unknown,
  ): Promise<IpcResult<unknown>> => {
    const controller = new AbortController();
    const key = typeof requestId === 'string' ? keyOf(event, requestId) : undefined;
    if (key !== undefined) inFlight.set(key, controller);
    const { type, inputSchema, middlewares, resolver } = procedure._def;
    const { signal } = controller;

    try {
      const ctx = await options.createContext(event);

      let input: unknown = rawInput;
      if (inputSchema !== undefined) {
        const result = await inputSchema['~standard'].validate(rawInput);
        if (result.issues !== undefined) throw new InputValidationError(result.issues);
        input = result.value;
      }

      const run = async (index: number, current: object): Promise<MiddlewareResult<unknown>> => {
        if (index === middlewares.length) {
          return { output: await resolver({ ctx: current, input, signal }) };
        }
        let called = false;
        const next = (opts?: { ctx: object }) => {
          if (called) throw new Error(`'${path}': a middleware called next() twice`);
          called = true;
          return run(index + 1, opts === undefined ? current : { ...current, ...opts.ctx });
        };
        return middlewares[index]({
          ctx: current,
          path,
          type,
          signal,
          next: next as MiddlewareNext<object>,
        });
      };

      const { output } = await run(0, ctx);
      if (options.checkClone) checkClone(path, output);
      return { ok: true, data: output, changed: [] };
    } catch (error) {
      const serialized: SerializedError = signal.aborted
        ? { code: 'cancelled', message: CANCELLED_MESSAGE, data: {} }
        : serializeError(error);
      options.onError?.({ path, type, error, serialized });
      return { ok: false, error: serialized, changed: [] };
    } finally {
      if (key !== undefined && inFlight.get(key) === controller) inFlight.delete(key);
    }
  };

  const channels: string[] = [];
  for (const [path, procedure] of procedures) {
    const channel = `${IPC_CHANNEL_PREFIX}${path}`;
    ipcMain.handle(channel, (event, input: unknown, requestId: unknown) =>
      execute(path, procedure, event, input, requestId),
    );
    channels.push(channel);
  }
  ipcMain.handle(IPC_CANCEL_CHANNEL, (event, requestId: unknown) => {
    if (typeof requestId !== 'string') return;
    inFlight.get(keyOf(event, requestId))?.abort();
  });
  channels.push(IPC_CANCEL_CHANNEL);

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
    for (const controller of inFlight.values()) controller.abort();
    inFlight.clear();
  };
}

function checkClone(path: string, output: unknown): void {
  try {
    structuredClone(output);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // an IpcError keeps its message, so the path reaches the renderer's console
    throw new IpcError('internal', `'${path}' returned a value IPC can't send: ${reason}`);
  }
}
