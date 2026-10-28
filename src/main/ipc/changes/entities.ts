import type { ChangedEntity } from '@common/changes';
import type { Workspace } from '@main/core';
import type { ArchiveChange } from '@main/core/archive/service';
import type { EventChange } from '@main/core/events/service';
import type { FavoriteChange } from '@main/core/favorites/service';
import type { FavoritableEntityType } from '@main/core/favorites/types';
import type { TaskLinkChange } from '@main/core/integrations/detach';
import type { IntegrationChange } from '@main/core/integrations/service';
import type { NoteChange } from '@main/core/notes/service';
import type { ProjectChange } from '@main/core/projects/service';
import type { SyncStatusChange } from '@main/core/sync/sync-state';
import type { SyncProgress } from '@main/core/sync/types';
import type { TaskChange } from '@main/core/tasks/service';

// Every change an open workspace announces, tagged by the service it came from. A service that
// gains a change stream adds it here and to subscribeToWorkspace; a new `type` in an existing one
// fails typecheck in changedEntities until it is mapped.
export type WorkspaceChange =
  | { source: 'tasks'; change: TaskChange }
  | { source: 'notes'; change: NoteChange }
  | { source: 'projects'; change: ProjectChange }
  | { source: 'events'; change: EventChange }
  | { source: 'archive'; change: ArchiveChange }
  | { source: 'favorites'; change: FavoriteChange }
  | { source: 'detach'; change: TaskLinkChange }
  | { source: 'integrations'; change: IntegrationChange }
  | { source: 'sync'; change: SyncProgress }
  | { source: 'syncStatus'; change: SyncStatusChange };

// Subscribes to every change stream of `workspace`. Returns the function that unsubscribes them all.
export function subscribeToWorkspace(
  workspace: Workspace,
  listener: (change: WorkspaceChange) => void,
): () => void {
  const unsubscribes = [
    workspace.tasks.onChange((change) => listener({ source: 'tasks', change })),
    workspace.notes.onChange((change) => listener({ source: 'notes', change })),
    workspace.projects.onChange((change) => listener({ source: 'projects', change })),
    workspace.events.onChange((change) => listener({ source: 'events', change })),
    workspace.archive.onChange((change) => listener({ source: 'archive', change })),
    workspace.favorites.onChange((change) => listener({ source: 'favorites', change })),
    workspace.detach.onChange((change) => listener({ source: 'detach', change })),
    workspace.integrations.onChange((change) => listener({ source: 'integrations', change })),
    workspace.sync.onProgress((change) => listener({ source: 'sync', change })),
    workspace.sync.onStatus((change) => listener({ source: 'syncStatus', change })),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

const FAVORITABLE: Record<FavoritableEntityType, ChangedEntity> = {
  tasks: 'task',
  projects: 'project',
  notes: 'note',
  events: 'event',
};

/**
 * The kinds of rows a change wrote, for the renderer to refetch. When in doubt this returns more:
 * over-reporting only costs a refetch, and missing one leaves a view stale. A service whose every
 * change writes the same kind maps without looking at `type`; detach and integrations switch on it,
 * so a new type there fails typecheck until it is mapped.
 */
export function changedEntities({ source, change }: WorkspaceChange): ChangedEntity[] {
  switch (source) {
    case 'tasks':
      return ['task'];
    case 'notes':
      return ['note'];
    case 'projects':
      return ['project'];
    case 'events':
      return ['event'];
    case 'archive':
      // an archive or restore cascades (a task's subtree and linked notes, a project's tasks and
      // notes): each kind whose ids came back
      return [
        ...(change.taskIds.length > 0 ? (['task'] as const) : []),
        ...(change.projectIds.length > 0 ? (['project'] as const) : []),
        ...(change.noteIds.length > 0 ? (['note'] as const) : []),
      ];
    case 'favorites':
      return [FAVORITABLE[change.entityType]];
    case 'detach':
      return detachEntities(change);
    case 'integrations':
      return integrationEntities(change);
    case 'sync':
      // a page the engine committed: the entity types its writer touched
      return [...change.summary.changed];
    case 'syncStatus':
      // lastSyncedAt, lastError and retryAt on the source
      return ['externalSource'];
    default:
      return assertNever(source);
  }
}

function detachEntities(change: TaskLinkChange): ChangedEntity[] {
  switch (change.type) {
    case 'detached':
    case 'reattached':
      // a reattach may also write the project the provider has the task in
      return unique(['task', ...change.changed]);
    case 'credentials_rejected':
      // the workspace moves the integration to needs_reauth, which IntegrationService announces
      // too; reported here as well in case it was not connected
      return ['integration'];
    default:
      return assertNever(change);
  }
}

function integrationEntities(change: IntegrationChange): ChangedEntity[] {
  switch (change.type) {
    case 'connected':
    case 'status_changed':
    case 'source_changed':
      return ['integration', 'externalSource'];
    case 'disconnected':
      // and the mirrored rows it deleted or turned into local copies
      return unique(['integration', 'externalSource', ...change.changed]);
    default:
      return assertNever(change);
  }
}

function unique(entities: ChangedEntity[]): ChangedEntity[] {
  return [...new Set(entities)];
}

// a change type no case handles fails typecheck here
export function assertNever(value: never): never {
  throw new Error(`Unhandled change: ${JSON.stringify(value)}`);
}
