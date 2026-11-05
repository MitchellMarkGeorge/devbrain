import { forwardRef, type CSSProperties } from 'react';
import { FileText, Folder, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ListRow, type ListRowProps } from '../ListRow';
import { StatusIcon } from '../../entities/StatusIcon';
import { resolveColor, type Swatch, type TaskStatus } from '../../types';
import styles from './TrashRow.module.css';

export type TrashedKind = 'project' | 'task' | 'note';

/** What Trash shows of a deleted item. */
export interface TrashedItem {
  kind: TrashedKind;
  title: string;
  /** a note's first line */
  excerpt?: string;
  /** a task's status, drawn as its icon */
  status?: TaskStatus;
  /** a project's folder colour */
  color?: Swatch | string;
  /** "Trashed 1d ago" */
  trashed: string;
}

export interface TrashRowProps extends Omit<
  ListRowProps,
  'icon' | 'title' | 'excerpt' | 'meta' | 'metaWidth' | 'actions'
> {
  item: TrashedItem;
  /** what it was linked to, as pills (a task's key and project, a project's status) */
  children?: ListRowProps['children'];
  onRestore?: () => void;
  /** deletes it for good (ask first) */
  onDelete?: () => void;
}

/**
 * A deleted project, task or note in Trash: its glyph, the title (and a note's excerpt, a step
 * smaller), its pills and when it was trashed; pointing at it shows Restore and Delete. A
 * strokeless 48px `ListRow`.
 */
export const TrashRow = forwardRef<HTMLDivElement, TrashRowProps>(function TrashRow(
  { item, onRestore, onDelete, ...props },
  ref,
) {
  const color = resolveColor(item.color);
  const icon =
    item.kind === 'task' ? (
      <StatusIcon status={item.status ?? 'not-started'} />
    ) : item.kind === 'project' ? (
      <Icon
        icon={Folder}
        size={16}
        className={styles.folder}
        data-coloured={color ? '' : undefined}
        style={color ? ({ '--project-color': color } as CSSProperties) : undefined}
      />
    ) : (
      <Icon icon={FileText} size={16} />
    );
  return (
    <ListRow
      ref={ref}
      icon={icon}
      title={item.title}
      excerpt={item.excerpt && <span className={styles.excerpt}>{item.excerpt}</span>}
      meta={item.trashed}
      metaWidth={88}
      actions={
        (onRestore || onDelete) && (
          <>
            <Button variant="outline" size="xs" icon={RotateCcw} onClick={onRestore}>
              Restore
            </Button>
            <Button variant="destructive" size="xs" icon={Trash2} onClick={onDelete}>
              Delete
            </Button>
          </>
        )
      }
      {...props}
    />
  );
});
