import { forwardRef, type CSSProperties } from 'react';
import { FileText, Folder, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ListRow, type ListRowProps } from '../ListRow';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskStatus, type ArchivedEntity } from '@common/types';
import { useFormat } from '../../lib/format';
import { resolveColor } from '../../types';
import styles from './TrashRow.module.css';

/**
 * What Trash shows of a deleted item: core's `ArchivedEntity` (from `archive.list`), and what the
 * page read of the item itself where it has it (a task's status, a project's colour, a note's
 * preview: `getByIds` on the owning service).
 */
export type TrashRowData = Pick<ArchivedEntity, 'entityType' | 'title' | 'archivedAt'> & {
  /** a task's status, drawn as its icon (not started without one) */
  status?: TaskStatus;
  /** a project's folder colour */
  color?: string | null;
  /** a note's first line */
  preview?: string | null;
};

export interface TrashRowProps extends Omit<
  ListRowProps,
  'icon' | 'title' | 'excerpt' | 'meta' | 'metaWidth' | 'actions'
> {
  item: TrashRowData;
  /** what it was linked to, as pills (a task's key and project, a project's status) */
  children?: ListRowProps['children'];
  onRestore?: () => void;
  /** deletes it for good (ask first) */
  onDelete?: () => void;
}

/**
 * A deleted project, task or note in Trash, drawn from core's `ArchivedEntity`: its glyph, the
 * title (and a note's preview, a step smaller), its pills and when it was trashed ("Trashed 1 day
 * ago", from `useFormat()`); pointing at it shows Restore and Delete. A
 * strokeless 48px `ListRow`.
 */
export const TrashRow = forwardRef<HTMLDivElement, TrashRowProps>(function TrashRow(
  { item, onRestore, onDelete, ...props },
  ref,
) {
  const { formatRelative } = useFormat();
  const color = resolveColor(item.color);
  const trashed = formatRelative(item.archivedAt);
  const icon =
    item.entityType === 'tasks' ? (
      <StatusIcon status={item.status ?? TaskStatus.NOT_STARTED} />
    ) : item.entityType === 'projects' ? (
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
      excerpt={item.preview && <span className={styles.excerpt}>{item.preview}</span>}
      meta={`Trashed ${trashed.charAt(0).toLowerCase()}${trashed.slice(1)}`}
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
