import { forwardRef, useState, type ComponentPropsWithoutRef } from 'react';
import type { Mention } from '@common/types';
import { cn } from '../../lib/cn';
import { MentionRow } from '../MentionRow';
import styles from './MentionList.module.css';

export interface MentionListProps extends ComponentPropsWithoutRef<'div'> {
  /** core's mentions, as `mentions.list` returns them: most recently changed first */
  mentions: Mention[];
  /** how many rows before "Show n more"; 5 by default */
  limit?: number;
  /** opens a row's source */
  onOpen?: (mention: Mention) => void;
}

/**
 * What mentions an item, as `MentionRow`s: the first `limit`, then "Show n more", which shows the
 * rest. With none, "Nothing mentions this yet". For a sheet's section or a page's popover.
 */
export const MentionList = forwardRef<HTMLDivElement, MentionListProps>(function MentionList(
  { mentions, limit = 5, onOpen, className, ...props },
  ref,
) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? mentions : mentions.slice(0, limit);
  const hidden = mentions.length - visible.length;
  if (mentions.length === 0) {
    return (
      <div ref={ref} className={cn(styles.empty, className)} {...props}>
        Nothing mentions this yet
      </div>
    );
  }
  return (
    <div ref={ref} className={cn(styles.list, className)} {...props}>
      {visible.map((mention) => (
        <MentionRow
          key={mention.source.id}
          mention={mention}
          onOpen={onOpen && (() => onOpen(mention))}
        />
      ))}
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          Show {hidden} more
        </button>
      )}
    </div>
  );
});
