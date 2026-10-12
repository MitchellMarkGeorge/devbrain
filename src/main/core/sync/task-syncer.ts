import { z } from 'zod';
import { SourceConfig, SyncCursor, TaskPage, TaskSource } from '../integrations/providers/provider';
import { SyncWriter } from './writer';
import { ActiveSync, RunContext, Syncer } from './syncer';

// A tasks source's run: pages of the provider's tasks, applied by SyncWriter.applyTaskPage. The
// reconcile pass and reattach are still in SyncEngine; see docs/follow-ups.md.
export class TaskSyncer implements Syncer {
  constructor(
    private readonly writer: SyncWriter,
    private readonly tasks: TaskSource,
    readonly cursorSchema: z.ZodType<SyncCursor>,
    private readonly configSchema: z.ZodType<SourceConfig>,
  ) {}

  async start({ sourceId, target, auth, cursor }: RunContext): Promise<ActiveSync<TaskPage>> {
    // what the user chose to sync; one that does not validate fails the run
    const config = this.configSchema.parse(target.config);
    return {
      cursor,
      pull: (current) => this.tasks.pull(auth, current, config),
      apply: (page) => this.writer.applyTaskPage(sourceId, page),
    };
  }
}
