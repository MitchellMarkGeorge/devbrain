import { describe, expect, it } from 'vitest';
import { TaskStatus, type SearchResult } from '@common/types';
import type { EventId, NoteId, TaskId } from '@common/ids';
import { toEditorEntity } from '../../editor/use-workspace-host';

const result = (fields: Partial<SearchResult>): SearchResult => ({
  entityId: 'note_1' as NoteId,
  entityType: 'note',
  title: 'A <b>note</b>',
  body: '',
  rank: -1,
  status: null,
  color: null,
  external: null,
  ...fields,
});

describe('toEditorEntity', () => {
  it("passes a task's status through, with its title as text", () => {
    expect(
      toEditorEntity(
        result({
          entityType: 'task',
          entityId: 'task_1' as TaskId,
          title: 'Fix &amp; <b>ship</b>',
          status: TaskStatus.IN_PROGRESS,
        }),
      ),
    ).toEqual({ type: 'task', id: 'task_1', title: 'Fix & ship', status: TaskStatus.IN_PROGRESS });
  });

  it("passes an event's colour through when it is #rrggbb", () => {
    expect(
      toEditorEntity(
        result({ entityType: 'event', entityId: 'event_1' as EventId, color: '#3366ff' }),
      ),
    ).toMatchObject({ type: 'event', color: '#3366ff' });
  });

  it('leaves out a colour that is not #rrggbb, so the menu draws its default', () => {
    for (const color of ['red; background: url(x)', 'blue', '#fff', null]) {
      expect(
        toEditorEntity(result({ entityType: 'event', entityId: 'event_1' as EventId, color })),
      ).not.toHaveProperty('color');
    }
  });

  it('gives a note neither', () => {
    expect(toEditorEntity(result({}))).toEqual({ type: 'note', id: 'note_1', title: 'A note' });
  });
});
