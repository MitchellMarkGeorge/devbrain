import type { ChangedEntity } from '@common/changes';
import type { WorkspaceId } from '@common/ids';
import type { DevBrain, Workspace } from '@main/core';
import type { WorkspaceChange as WorkspaceLifecycleChange } from '@main/core/workspace/service';
import type { Broadcaster } from '../broadcaster';
import {
  assertNever,
  changedEntities,
  subscribeToWorkspace,
  type WorkspaceChange,
} from './entities';
import { openScope } from './scope';

/**
 * Decides where each of core's changes goes. It follows the open workspace's change streams and
 * maps each change to the kinds of rows it wrote: inside a mutation's open scope they go into that
 * call's response, and anywhere else (a sync page, work that finished after its response) out as
 * a `db.changes` broadcast. It also broadcasts the deltas status UI listens for, whatever the
 * scope: `integrations.changed`, `sync.progress`, `sources.changed` and `workspace.changed`.
 *
 * Core runs listeners synchronously in the async context of what made the change, so the scope
 * found in a listener is the one of the call responsible.
 */
export class ChangeRouter {
  // the workspace whose changes are followed, and how to stop following them
  private followed: { id: WorkspaceId; unsubscribe: () => void } | null = null;

  constructor(private readonly broadcaster: Broadcaster) {}

  /**
   * Follows the workspace open now, if any, then whichever one is open after each open, switch,
   * close or delete; the old workspace's changes are no longer routed once it has closed. Returns
   * the function that stops following.
   */
  attach(devBrain: Pick<DevBrain, 'workspaces'>): () => void {
    const current = devBrain.workspaces.currentWorkspace;
    if (current !== null) this.follow(current);
    const unsubscribe = devBrain.workspaces.onChange((change) => this.onWorkspaceChange(change));
    return () => {
      unsubscribe();
      this.unfollow();
    };
  }

  // into the open scope, or out as `db.changes` when there is none
  route(entities: ChangedEntity[]): void {
    if (entities.length === 0) return;
    const scope = openScope();
    if (scope !== undefined) scope.record(...entities);
    else this.broadcaster.send('db.changes', { entities: [...new Set(entities)] });
  }

  private onWorkspaceChange(change: WorkspaceLifecycleChange): void {
    switch (change.type) {
      case 'opened':
        this.follow(change.workspace);
        this.broadcaster.send('workspace.changed', { id: change.workspace.info.id });
        return;
      case 'closed':
        if (this.followed?.id === change.workspaceId) this.unfollow();
        this.broadcaster.send('workspace.changed', { id: null });
        return;
      default:
        assertNever(change);
    }
  }

  private follow(workspace: Workspace): void {
    this.unfollow();
    this.followed = {
      id: workspace.info.id,
      unsubscribe: subscribeToWorkspace(workspace, (change) => this.onChange(change)),
    };
  }

  private unfollow(): void {
    this.followed?.unsubscribe();
    this.followed = null;
  }

  private onChange(change: WorkspaceChange): void {
    this.route(changedEntities(change));
    this.broadcastDelta(change);
  }

  private broadcastDelta({ source, change }: WorkspaceChange): void {
    switch (source) {
      case 'integrations':
        this.broadcaster.send('integrations.changed', {
          integrationId: change.integrationId,
          type: change.type,
        });
        if (change.type === 'source_changed') {
          this.broadcaster.send('sources.changed', { sourceId: change.sourceId });
        }
        return;
      case 'sync':
        this.broadcaster.send('sync.progress', {
          sourceId: change.sourceId,
          phase: change.phase,
          itemsApplied: change.itemsApplied,
        });
        return;
      case 'syncStatus':
        this.broadcaster.send('sources.changed', { sourceId: change.sourceId });
        return;
      default:
        // the rest carry no status the renderer shows outside the rows it refetches
        return;
    }
  }
}
