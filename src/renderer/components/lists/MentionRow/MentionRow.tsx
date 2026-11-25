import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { CalendarDays, FileText, Folder } from 'lucide-react';
import type { Mention, MentionSource } from '@common/types';
import { cn } from '../../lib/cn';
import { useFormat } from '../../lib/format';
import { StatusIcon } from '../../entities/StatusIcon';
import { ColourBar } from '../../ui/ColourBar';
import { Icon } from '../../ui/Icon';
import { resolveColor } from '../../types';
import styles from './MentionRow.module.css';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export interface MentionRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** core's mention as it is: the item it is in, and when that changed */
  mention: Mention;
  /** opens the source: a click on the row, or Enter */
  onOpen?: () => void;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
}

/** the source's glyph: a task's status, a project's folder in its colour, an event's bar, a note */
function SourceGlyph({ source }: { source: MentionSource }) {
  switch (source.type) {
    case 'task':
      return <StatusIcon status={source.status} size={14} />;
    case 'project':
      return <Icon icon={Folder} size={16} style={{ color: resolveColor(source.color, 'blue') }} />;
    case 'event':
      return <ColourBar color={resolveColor(source.color, 'green')} />;
    case 'note':
      // an event's note is the meeting's: drawn as the calendar
      return <Icon icon={source.linkedEventId ? CalendarDays : FileText} size={16} />;
  }
}

/**
 * One item that mentions another, in "Mentioned in": the source's glyph, its title ("Untitled"
 * when it has none) and when it changed ("2h ago" within a week, then "Jun 18"). No preview text.
 * The compact 36px row of `LinkedTaskRow`; clicking it or Enter opens the source.
 */
export const MentionRow = forwardRef<HTMLDivElement, MentionRowProps>(function MentionRow(
  { mention, onOpen, state, className, onKeyDown, ...props },
  ref,
) {
  const { now, formatRelative, formatDate } = useFormat('minute');
  const { source, updatedAt } = mention;
  const recent = now.getTime() - updatedAt.getTime() < WEEK;
  return (
    <div
      ref={ref}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      data-state={state}
      data-source-id={source.id}
      className={cn(styles.row, className)}
      onClick={onOpen}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter' && event.target === event.currentTarget && onOpen) {
          event.preventDefault();
          onOpen();
        }
      }}
      {...props}
    >
      <span className={styles.glyph}>
        <SourceGlyph source={source} />
      </span>
      <span className={styles.title}>{source.title || 'Untitled'}</span>
      <span className={styles.time}>
        {recent ? formatRelative(updatedAt) : formatDate(updatedAt)}
      </span>
    </div>
  );
});
