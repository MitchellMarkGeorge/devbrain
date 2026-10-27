import { describe, expect, it, vi } from 'vitest';
import { ChangeListeners } from '../../shared/changes';

const SECRET = 'ada@example.com';

function throwing(): never {
  throw new TypeError(`no account ${SECRET}`);
}

describe('ChangeListeners — a listener that throws', () => {
  it('logs the error class only, never its message', () => {
    const logger = { error: vi.fn() };
    const changes = new ChangeListeners<{ id: string }>('Task', { logger });
    const other = vi.fn();
    changes.add(throwing);
    changes.add(other);

    changes.emit({ id: 'task_1' });

    expect(other).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      'Task change listener threw error=TypeError',
    );
  });

  it('logs to the console when given no logger', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const changes = new ChangeListeners<{ id: string }>('Task');
      changes.add(throwing);
      changes.emit({ id: 'task_1' });
      expect(error).toHaveBeenCalledExactlyOnceWith('Task change listener threw error=TypeError');
    } finally {
      error.mockRestore();
    }
  });

  it('sends the error and change to a reporter instead, when given one', () => {
    const logger = { error: vi.fn() };
    const report = vi.fn();
    const changes = new ChangeListeners<{ id: string }>('Task', { logger, report });
    changes.add(throwing);

    changes.emit({ id: 'task_1' });

    expect(report).toHaveBeenCalledExactlyOnceWith(expect.any(TypeError), { id: 'task_1' });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
