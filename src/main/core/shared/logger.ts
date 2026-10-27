// The logging methods core uses. The main process passes electron-log; anything that runs core
// without it (tests, scripts) gets the console. Never log a thrown error's message or the error
// itself: a message can quote user or account data, so log its class with errorClass.
export interface Logger {
  info(...params: unknown[]): void;
  warn(...params: unknown[]): void;
  error(...params: unknown[]): void;
}

export const consoleLogger: Logger = console;

// the class of a thrown value, e.g. "TypeError", or its type when it is not an Error
export function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
