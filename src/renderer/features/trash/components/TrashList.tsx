import { useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { ArchivedEntity, ExternalRef, ProjectSummary } from '@common/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  EntityPill,
  PROJECT_STATUS_LABELS,
  ProjectStatusIcon,
  providerOf,
  ScrollArea,
  SourcePill,
  TrashRow,
  type TrashRowData,
} from '@renderer/components';
import { paddingBefore, useVirtualList } from '@renderer/components/lib/virtual';
import { SIZE } from '@renderer/styles/tokens';
import type { TrashActions } from '../hooks/use-trash-actions';
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
              const { data, titlePills, pills } = rowOf(item);
              return (
                <TrashRow
                  key={virtual.key}
                  ref={virtualizer.measureElement}
                  data-index={virtual.index}
                  data-trash-id={item.id}
                  aria-rowindex={virtual.index + 1}
                  item={data}
                  titlePills={titlePills}
                  onOpen={() => actions.open(item)}
                  onRestore={() => void actions.restore(item)}
                  onDelete={() => void actions.remove(item)}
                >
                  {pills}
                </TrashRow>
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

/**
 * What a row draws of its item, from the row `archive.listArchived` returned: a task's status, its
 * key (a synced task's, straight after the title) and project; a project's colour, key and status;
 * a note's first line and project. Colours go to the components as they came: they parse them.
 */
function rowOf(item: ArchivedEntity): {
  data: TrashRowData;
  titlePills?: ReactNode;
  pills?: ReactNode;
} {
  const { entityType, title, archivedAt } = item;
  switch (item.entityType) {
    case 'tasks':
      return {
        data: { entityType, title, archivedAt, status: item.status },
        titlePills: keyPill(item.external),
        pills: projectPill(item.project),
      };
    case 'projects':
      return {
        data: { entityType, title, archivedAt, color: item.color },
        titlePills: keyPill(item.external),
        pills: (
          <EntityPill glyph={<ProjectStatusIcon status={item.status} size={12} />}>
            {PROJECT_STATUS_LABELS[item.status]}
          </EntityPill>
        ),
      };
    case 'notes':
      return {
        data: { entityType, title, archivedAt, preview: item.preview },
        pills: projectPill(item.project),
      };
  }
}

// a synced item's key ("ENG-124") as its source pill; none for a local one or one with no key
function keyPill(external: ExternalRef | null): ReactNode {
  if (!external?.key) return undefined;
  return <SourcePill provider={providerOf(external)}>{external.key}</SourcePill>;
}

function projectPill(project: ProjectSummary | null): ReactNode {
  if (!project) return undefined;
  return <EntityPill entity={{ type: 'project', title: project.title, color: project.color }} />;
}
