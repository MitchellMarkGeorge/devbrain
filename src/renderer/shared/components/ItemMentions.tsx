import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Mention, MentionTargetId } from '@common/types';
import { MentionsPill, MentionsSection } from '@renderer/components';
import { mentionsQuery } from '../api/mentions';
import { useOpenEntity } from '../hooks/use-open-entity';

// What mentions a task, project, note or event (core/mentions), as its page and its sheet show
// it. Both leave themselves out until something mentions the item.

// opens a row's source where it lives: an event on its day in the calendar
function useOpenMention(): (mention: Mention) => void {
  const openEntity = useOpenEntity();
  return ({ source }) =>
    openEntity({ id: source.id, startAt: source.type === 'event' ? source.startAt : undefined });
}

/** "@ 7 mentions" on a page, opening the list in a popover; nothing while none */
export function ItemMentionsPill({ targetId }: { targetId: MentionTargetId }) {
  const mentions = useQuery(mentionsQuery(targetId));
  const openMention = useOpenMention();
  const [open, setOpen] = useState(false);
  if (!mentions.data?.length) return null;
  return (
    <MentionsPill
      mentions={mentions.data}
      open={open}
      onOpenChange={setOpen}
      onOpen={(mention) => {
        setOpen(false);
        openMention(mention);
      }}
      data-testid="mentions-pill"
    />
  );
}

/** "Mentioned in" in a sheet, folded to one line until opened; nothing while none */
export function ItemMentionsSection({ targetId }: { targetId: MentionTargetId }) {
  const mentions = useQuery(mentionsQuery(targetId));
  const openMention = useOpenMention();
  if (!mentions.data?.length) return null;
  return (
    <MentionsSection mentions={mentions.data} onOpen={openMention} data-testid="mentions-section" />
  );
}
