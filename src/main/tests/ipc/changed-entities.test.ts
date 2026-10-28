import { describe, expect, it } from 'vitest';
import type { ChangedEntity } from '@common/changes';
import { changedEntities, type WorkspaceChange } from '@main/ipc/changes/entities';

// The mapping table in docs/ipc/implementation-plan.md, for the changes the router tests don't
// produce from a real workspace.

const cases: [string, unknown, ChangedEntity[]][] = [
  ['an event delete', { source: 'events', change: { type: 'deleted', eventIds: [] } }, ['event']],
  [
    'a calendar update',
    { source: 'calendars', change: { type: 'updated', calendar: {} } },
    ['calendar'],
  ],
  [
    'a project-only archive',
    {
      source: 'archive',
      change: { type: 'restored', taskIds: [], projectIds: ['prj_1'], noteIds: [] },
    },
    ['project'],
  ],
  [
    'an unfavorited note',
    { source: 'favorites', change: { type: 'unfavorited', entityType: 'notes', id: 'nte_1' } },
    ['note'],
  ],
  [
    'a reattach that wrote a project',
    {
      source: 'detach',
      change: { type: 'reattached', taskId: 't', taskIds: [], changed: ['task', 'project'] },
    },
    ['task', 'project'],
  ],
  [
    'rejected credentials',
    { source: 'detach', change: { type: 'credentials_rejected', taskId: 't', integrationId: 'i' } },
    ['integration'],
  ],
  [
    'a disconnect',
    {
      source: 'integrations',
      change: {
        type: 'disconnected',
        integrationId: 'i',
        sourceIds: [],
        deleted: {},
        changed: ['event', 'calendar'],
      },
    },
    ['integration', 'externalSource', 'event', 'calendar'],
  ],
  [
    'a sync status',
    {
      source: 'syncStatus',
      change: { type: 'sync_status_changed', integrationId: 'i', sourceId: 's' },
    },
    ['externalSource'],
  ],
];

describe('changedEntities', () => {
  it.each(cases)('maps %s', (_name, change, entities) => {
    expect(changedEntities(change as WorkspaceChange)).toEqual(entities);
  });

  it('throws on a change no case handles, which typecheck rejects', () => {
    expect(() => changedEntities({ source: 'nope' } as unknown as WorkspaceChange)).toThrow();
  });
});
