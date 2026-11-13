import { useMemo, useRef, useState } from 'react';
import { RotateCcw, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { ArchivedEntity } from '@common/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ScrollArea,
  TrashRow,
} from '../../components';
import { paddingBefore, useVirtualList } from '../../components/lib/virtual';
import { SIZE } from '../../styles/tokens';
import type { TrashActions } from './use-trash-actions';
import styles from './TrashPage.module.css';

export interface TrashListProps {
  items: readonly ArchivedEntity[];
  actions: TrashActions;
  /** asks for the next page, once the rows drawn come near the end of those loaded */
  onEndReached?: () => void;
  /** a footnote after the last row */
  footer?: React.ReactNode;
}

/**
 * Trash's rows (Figma `7159:11875`): virtualized, 48px each, in their own scroller. A row opens
 * its item; pointing at it shows Restore and Delete, and a right-click opens Open / Restore /
 * Delete permanently (`7175:29207`).
 */
export function TrashList({ items, actions, onEndReached, footer }: TrashListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [menuItem, setMenuItem] = useState<ArchivedEntity | null>(null);
  const byId = useMemo(() => new Map(items.map((item) => [item.id as string, item])), [items]);
  const virtualizer = useVirtualList({
    scrollerRef: scroller,
    count: items.length,
    estimateSize: () => SIZE['row-height'],
    getItemKey: (index) => items[index].id,
    onEndReached,
  });
  const drawn = virtualizer.getVirtualItems();

  return (
    <ContextMenu>
      <ContextMenuTrigger
        style={{ display: 'contents' }}
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>('[data-trash-id]');
          const item = row ? (byId.get(row.dataset.trashId ?? '') ?? null) : null;
          setMenuItem(item);
          if (!item) event.preventDefault();
        }}
      >
        <ScrollArea
          className={styles.list}
          viewportRef={scroller}
          viewportClassName={styles.viewport}
          viewportProps={{ role: 'grid', 'aria-label': 'Trash', 'aria-rowcount': items.length }}
        >
          <div
            className={styles.rows}
            style={{ height: virtualizer.getTotalSize(), paddingTop: paddingBefore(drawn) }}
          >
            {drawn.map((virtual) => {
              const item = items[virtual.index];
              if (!item) return null;
              return (
                <TrashRow
                  key={virtual.key}
                  ref={virtualizer.measureElement}
                  data-index={virtual.index}
                  data-trash-id={item.id}
                  aria-rowindex={virtual.index + 1}
                  item={item}
                  onOpen={() => actions.open(item)}
                  onRestore={() => void actions.restore(item)}
                  onDelete={() => void actions.remove(item)}
                />
              );
            })}
          </div>
          {footer}
        </ScrollArea>
      </ContextMenuTrigger>
      <ContextMenuContent width="sm">
        {menuItem && (
          <>
            <ContextMenuItem
              icon={SquareArrowOutUpRight}
              shortcut="↵"
              onClick={() => actions.open(menuItem)}
            >
              Open
            </ContextMenuItem>
            <ContextMenuItem icon={RotateCcw} onClick={() => void actions.restore(menuItem)}>
              Restore
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={Trash2}
              variant="destructive"
              onClick={() => void actions.remove(menuItem)}
            >
              Delete permanently
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
