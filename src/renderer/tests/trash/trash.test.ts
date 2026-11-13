import { describe, expect, it } from 'vitest';
import type { NoteId, ProjectId, TaskId } from '@common/ids';
import { trashSearchSchema } from '../../pages/trash/search';
import { deleteConsequence, emptyTrashSummary } from '../../pages/trash/use-trash-actions';

// Trash's search params and the words its confirmations and toasts use.

describe('trashSearchSchema', () => {
  it('reads the tab and sort, dropping a bad value on its own', () => {
    expect(trashSearchSchema.parse({ tab: 'notes', sort: 'trashed' })).toEqual({
      tab: 'notes',
      sort: 'trashed',
    });
    expect(trashSearchSchema.parse({ tab: 'events', sort: 'trashed' })).toEqual({
      tab: undefined,
      sort: 'trashed',
    });
    expect(trashSearchSchema.parse({})).toEqual({});
  });
});

describe('deleteConsequence', () => {
  it('says what happens to what links to each kind (docs/deleting.md)', () => {
    const item = (entityType: 'tasks' | 'projects' | 'notes') => ({
      id: 'tsk_1' as TaskId,
      entityType,
      title: 'Plan',
    });
    expect(deleteConsequence(item('tasks'))).toContain('and its subtasks');
    expect(deleteConsequence(item('tasks'))).toContain('task notes are kept');
    expect(deleteConsequence(item('projects'))).toContain('no longer belong to a project');
    expect(deleteConsequence(item('notes'))).toContain('without the link');
  });
});

describe('emptyTrashSummary', () => {
  const empty = {
    taskIds: [] as TaskId[],
    projectIds: [] as ProjectId[],
    noteIds: [] as NoteId[],
    keptTaskIds: [] as TaskId[],
    filesNotRemoved: [] as NoteId[],
  };

  it('counts what was deleted', () => {
    expect(
      emptyTrashSummary({
        ...empty,
        taskIds: ['tsk_1' as TaskId, 'tsk_2' as TaskId],
        noteIds: ['nte_1' as NoteId],
      }),
    ).toEqual({ title: 'Deleted 3 items', description: undefined });
    expect(emptyTrashSummary({ ...empty, noteIds: ['nte_1' as NoteId] }).title).toBe(
      'Deleted 1 item',
    );
  });

  it('says what stayed, and why', () => {
    const summary = emptyTrashSummary({
      ...empty,
      keptTaskIds: ['tsk_1' as TaskId],
      filesNotRemoved: ['nte_1' as NoteId, 'nte_2' as NoteId],
    });
    expect(summary.title).toBe('Nothing was deleted');
    expect(summary.description).toBe(
      '1 task stayed, as it has subtasks outside the trash. 2 note files couldn’t be removed from the notes folder.',
    );
  });
});
