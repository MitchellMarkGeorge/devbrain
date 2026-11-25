import { AtSign } from 'lucide-react';
import type { Mention } from '@common/types';
import { MentionList } from '../../lists/MentionList';
import { Badge } from '../../ui/Badge';
import { DetailSection, type DetailSectionProps } from '../DetailSection';
import { PillPopover, type PillPopoverProps } from '../PillPopover';

/** "7 mentions", "1 mention" */
export function mentionsLabel(count: number): string {
  return `${count} ${count === 1 ? 'mention' : 'mentions'}`;
}

export interface MentionsSectionProps extends Omit<
  DetailSectionProps,
  'title' | 'count' | 'glyph' | 'action' | 'collapsible' | 'children' | 'onOpenChange' | 'open'
> {
  /** core's mentions, as `mentions.list` returns them */
  mentions: Mention[];
  /** opens a row's source */
  onOpen?: (mention: Mention) => void;
  /** how many rows before "Show n more"; 5 by default */
  limit?: number;
}

/**
 * "Mentioned in" in a sheet: a collapsible `DetailSection`, folded to its heading line by default
 * (`defaultOpen` opens it), with the count as a badge, over a `MentionList`.
 */
export function MentionsSection({
  mentions,
  onOpen,
  limit,
  defaultOpen = false,
  ...props
}: MentionsSectionProps) {
  return (
    <DetailSection
      collapsible
      defaultOpen={defaultOpen}
      title="Mentioned in"
      count={mentions.length > 0 ? <Badge variant="secondary">{mentions.length}</Badge> : undefined}
      {...props}
    >
      <MentionList mentions={mentions} onOpen={onOpen} limit={limit} />
    </DetailSection>
  );
}

export interface MentionsPillProps extends Omit<
  PillPopoverProps,
  'glyph' | 'label' | 'heading' | 'action' | 'children'
> {
  /** core's mentions, as `mentions.list` returns them */
  mentions: Mention[];
  /** opens a row's source */
  onOpen?: (mention: Mention) => void;
}

/**
 * "@ 7 mentions" on a page (a task's links line, a note's header), opening "Mentioned in" in a
 * `PillPopover`: every row, the list scrolling past ten or so.
 */
export function MentionsPill({ mentions, onOpen, ...props }: MentionsPillProps) {
  return (
    <PillPopover
      glyph={AtSign}
      label={mentionsLabel(mentions.length)}
      heading="Mentioned in"
      {...props}
    >
      <MentionList mentions={mentions} onOpen={onOpen} limit={Infinity} />
    </PillPopover>
  );
}
