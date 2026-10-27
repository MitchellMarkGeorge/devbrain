import { consoleLogger, errorClass, type Logger } from './logger';

export type ChangeListener<C> = (change: C) => void;

// reports a listener that threw; the change is passed for context, such as the id it was about
export type ListenerErrorReporter<C> = (error: unknown, change: C) => void;

export interface ChangeListenersOptions<C> {
  // where a listener's error is logged, by its class only; defaults to the console
  logger?: Pick<Logger, 'error'>;
  // replaces that log line, for a service that adds context such as the id the change was about
  report?: ListenerErrorReporter<C>;
}

// The listeners of one service's changes, for in-process subscribers such as the scheduler and the
// workspace keeping search in step. Every service that tells others what it changed sends it
// through one of these. What emits has already happened, so a failing listener is reported and
// must not fail the call that emitted, or the other listeners.
export class ChangeListeners<C> {
  private readonly listeners = new Set<ChangeListener<C>>();
  private readonly report: ListenerErrorReporter<C>;

  // `name` labels a listener's error in the log, e.g. "Task"
  constructor(name: string, options: ChangeListenersOptions<C> = {}) {
    const logger = options.logger ?? consoleLogger;
    this.report =
      options.report ??
      ((error) => logger.error(`${name} change listener threw error=${errorClass(error)}`));
  }

  // returns a function that unsubscribes the listener
  add(listener: ChangeListener<C>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(change: C): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        this.report(error, change);
      }
    }
  }
}
