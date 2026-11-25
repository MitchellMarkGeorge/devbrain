import { describe, expect, it } from 'vitest';
import { TaskStatus, type SearchResult } from '@common/types';
import { toEditorEntity } from '@renderer/shared/hooks/use-workspace-editor-host';

// a match as search.search answers it, with what toEditorEntity reads of its entity
const result = (
  entityType: SearchResult['entityType'],
  entity: Record<string, unknown>,
): SearchResult =>
  ({
    entityType,
    entity: { id: `${entityType}_1`, title: 'A note', ...entity },
    title: 'A <b>note</b>',
    body: '',
    key: null,
    rank: -1,
  }) as SearchResult;

describe('toEditorEntity', () => {
  it("reads a task's title and status from the task found", () => {
    expect(
      toEditorEntity(result('task', { title: 'Fix & ship', status: TaskStatus.IN_PROGRESS })),
    ).toEqual({ type: 'task', id: 'task_1', title: 'Fix & ship', status: TaskStatus.IN_PROGRESS });
  });

  it("passes an event's own colour through when it is #rrggbb", () => {
    expect(toEditorEntity(result('event', { color: '#3366ff' }))).toMatchObject({
      type: 'event',
      color: '#3366ff',
    });
  });

  it('leaves out a colour that is not #rrggbb, so the menu draws its default', () => {
    for (const color of ['red; background: url(x)', 'blue', '#fff', null]) {
      expect(toEditorEntity(result('event', { color }))).not.toHaveProperty('color');
    }
  });

  it('gives a note neither', () => {
    expect(toEditorEntity(result('note', {}))).toEqual({
      type: 'note',
      id: 'note_1',
      title: 'A note',
    });
  });
});
