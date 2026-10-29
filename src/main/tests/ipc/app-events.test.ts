import { describe, expectTypeOf, it } from 'vitest';
import type { AppEvents, IntegrationChangeType, SyncPhase } from '@common/events';
import type { ChangedEntity } from '@common/changes';
import type { IntegrationChange } from '@main/core/integrations/service';
import type { SyncStatusChange } from '@main/core/sync/sync-state';
import type { SyncEntityType, SyncMode, SyncProgress } from '@main/core/sync/types';

// src/common can't import from main, so the event payloads restate core's values. Checked by
// `npm run typecheck`: these fail when core adds a value the events don't carry.
describe('AppEvents', () => {
  it('carries every sync phase core reports', () => {
    expectTypeOf<`${SyncMode}`>().toEqualTypeOf<SyncPhase>();
  });

  it('carries every integration change type core emits', () => {
    expectTypeOf<IntegrationChange['type']>().toEqualTypeOf<IntegrationChangeType>();
  });

  it('can report every entity type a sync changes', () => {
    expectTypeOf<SyncEntityType>().toExtend<ChangedEntity>();
  });

  it('reads the status deltas from what core reports', () => {
    expectTypeOf<Pick<SyncProgress, 'sourceId' | 'itemsApplied'>>().toEqualTypeOf<
      Omit<AppEvents['sync.progress'], 'phase'>
    >();
    expectTypeOf<Pick<IntegrationChange, 'integrationId'>>().toEqualTypeOf<
      Pick<AppEvents['integrations.changed'], 'integrationId'>
    >();
    expectTypeOf<Pick<SyncStatusChange, 'sourceId'>>().toEqualTypeOf<
      AppEvents['sources.changed']
    >();
  });
});
