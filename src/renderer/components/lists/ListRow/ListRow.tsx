import {
  forwardRef,
  useMemo,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { mergeRefs } from '../../lib/merge-refs';
import { useHintTarget } from '../../../keyboard/hints';
import { Checkbox } from '../../ui/Checkbox';
import styles from './ListRow.module.css';

export interface ListRowProps extends Omit<ComponentProps<'div'>, 'title' | 'onSelect'> {
  /** the 16px glyph in the 24px slot where a task row's status icon sits */
  icon?: ReactNode;
  /** the name, in `foreground-strong` */
  title: ReactNode;
  /** pills right after the title (a synced task's key) */
  titlePills?: ReactNode;
  /** a one-line excerpt after the title, in `muted-foreground`, cut with "…" */
  excerpt?: ReactNode;
  /** pills and other parts on the right, before `meta` */
  children?: ReactNode;
  /** the quiet text that ends the row ("2h ago", "Due Jul 1"), right-aligned */
  meta?: ReactNode;
  /** buttons after the meta text that show while the row is pointed at or focused (Restore, Delete) */
  actions?: ReactNode;
  /** the width the meta text is aligned in, so columns line up from row to row (default 64px) */
  metaWidth?: number;
  /** the row is selected */
  selected?: boolean;
  /** something in the list is selected: the checkbox shows on every row */
  selecting?: boolean;
  /** joins a selected row to the selected row above or below into one block */
  joinPrev?: boolean;
  joinNext?: boolean;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
  /** dims the title and icon (a deleted item in Trash) */
  muted?: boolean;
  /** toggles selection (the checkbox, or `X` on the focused row); without it there is no checkbox */
  onSelect?: () => void;
  /** opens the item (a click on the row, or Enter) */
  onOpen?: () => void;
}

// clicks on the row's own controls don't open the item
function fromControl(event: MouseEvent<HTMLElement>): boolean {
  const control = (event.target as Element).closest('button, a, [role="checkbox"], input');
  return control != null && control !== event.currentTarget;
}

/**
 * The strokeless 48px row every list shares with `TaskRow`: a selection checkbox in the 36px strip
 * on the left (on hover, focus and while selecting), a glyph, the title and an optional excerpt,
 * then pills and a quiet meta text on the right. `NoteRow`, `ProjectRow` and Trash's rows are
 * built on it.
 */
export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  {
    icon,
    title,
    titlePills,
    excerpt,
    children,
    meta,
    metaWidth = 64,
    actions,
    selected,
    selecting,
    joinPrev,
    joinNext,
    state,
    muted,
    onSelect,
    onOpen,
    className,
    onClick,
    onKeyDown,
    ...props
  },
  ref,
) {
  // Vim's `f` labels the row, and its label opens the item
  const own = useRef<HTMLDivElement>(null);
  const setRef = useMemo(() => mergeRefs(ref, own), [ref]);
  useHintTarget(own, onOpen);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    if (event.key.toLowerCase() === 'x' && onSelect) {
      event.preventDefault();
      onSelect();
    } else if (event.key === 'Enter' && onOpen) {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      ref={setRef}
      role="row"
      tabIndex={0}
      aria-selected={onSelect ? !!selected : undefined}
      data-selected={selected ? '' : undefined}
      data-selecting={selecting ? '' : undefined}
      data-join-prev={joinPrev ? '' : undefined}
      data-join-next={joinNext ? '' : undefined}
      data-state={state}
      data-muted={muted ? '' : undefined}
      className={cn(styles.row, className)}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && onOpen && !fromControl(event)) onOpen();
      }}
      {...props}
    >
      {onSelect && (
        <Checkbox
          className={styles.check}
          checked={!!selected}
          onCheckedChange={() => onSelect()}
          tabIndex={-1}
          aria-label={typeof title === 'string' ? `Select ${title}` : 'Select'}
        />
      )}
      {icon != null && <span className={styles.icon}>{icon}</span>}
      <div className={styles.main}>
        <span className={styles.title}>{title}</span>
        {titlePills}
        {excerpt != null && <span className={styles.excerpt}>{excerpt}</span>}
      </div>
      {(children != null || meta != null || actions != null) && (
        <div className={styles.side}>
          {children}
          {meta != null && (
            <span className={styles.meta} style={{ minWidth: metaWidth }}>
              {meta}
            </span>
          )}
          {actions != null && <span className={styles.actions}>{actions}</span>}
        </div>
      )}
    </div>
  );
});
