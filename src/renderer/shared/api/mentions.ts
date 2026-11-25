import type { MentionTargetId } from '@common/types';
import { trpc } from '@renderer/ipc';

/** What mentions an item, most recently changed first: its pill's popover, its sheet's section. */
export function mentionsQuery(targetId: MentionTargetId) {
  return trpc.mentions.list.queryOptions({ targetId });
}
