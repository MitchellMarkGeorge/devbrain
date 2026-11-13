import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type ForwardedRef,
  type ReactElement,
  type Ref,
} from 'react';
import type { ProjectListItem } from '@common/types';
import { cn } from '../../lib/cn';
import { paddingBefore, useVirtualList } from '../../lib/virtual';
import { SIZE } from '../../../styles/tokens';
import { ScrollArea } from '../../ui/ScrollArea';
import { ProjectRow, type ProjectRowData } from '../ProjectRow';
import { useFocusedRowId, useRefocusOnRemoval } from '../row-focus';
import styles from './ProjectList.module.css';

/**
 * A row of the list: core's `ProjectListItem` as it is, or the fields a `ProjectRow` reads, its id
 * and its stats (the progress bar).
 */
export type ProjectListRow = ProjectRowData &
  Pick<ProjectListItem, 'id'> & {
    stats?: ProjectListItem['stats'];
  };

export interface ProjectListProps<Project extends ProjectListRow = ProjectListRow> extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  projects: Project[];
  /**
   * how many projects there are in all, loaded or not (`aria-rowcount`); the loaded ones by default;
   * -1 while more may load and the total is not known (ARIA's "unknown")
   */
  rowCount?: number;
  /** called when the last rendered row comes within `endReachedThreshold` rows of the end */
  onEndReached?: () => void;
  /** default 20 */
  endReachedThreshold?: number;
  /** opens a project: a click on its row, or Enter */
  onOpen?: (project: Project) => void;
  /** the selected rows' ids, when controlled */
  selected?: string[];
  /** the rows selected at first, when uncontrolled */
  defaultSelected?: string[];
  onSelectedChange?: (selected: string[]) => void;
  /** the focused row's id, when controlled; the first row by default */
  focusedId?: string;
  onFocusedIdChange?: (id: string) => void;
}

/**
 * What the list can do, for the app's keyboard commands (`ref`): it binds no keys itself beyond a
 * row's Enter and X, so a keymap moves focus and selects through these.
 */
export interface ProjectListHandle<Project extends ProjectListRow = ProjectListRow> {
  focusedItem(): Project | undefined;
  selectedItems(): Project[];
  moveFocus(by: number): void;
  focusFirst(): void;
  focusLast(): void;
  toggleSelected(): void;
  clearSelection(): void;
}

/**
 * A virtualized list of `ProjectRow`s: the Projects page's list view over every project in a
 * workspace, as `NoteList` is the Notes page's. It is its own scroller, filling the height its
 * container gives it, and draws only the rows in view (and about ten either side); rows are
 * `row-height`. Rows select as `TaskList`'s do: a checkbox on hover and focus, on every row while
 * anything is selected, and selected rows next to each other join into one block. The page draws
 * the `SelectionBar`. Focus and selection are kept as project ids, so they survive a row scrolling
 * out of view, and the list is one tab stop. Each row carries `data-project-id`, for a page's
 * right-click menu to find its project.
 */
function ProjectListInner<Project extends ProjectListRow>(
  {
    projects,
    rowCount,
    onEndReached,
    endReachedThreshold,
    onOpen,
    focusedId: focusedIdProp,
    onFocusedIdChange,
    selected: selectedProp,
    defaultSelected = [],
    onSelectedChange,
    className,
    style,
    onFocus,
    ...props
  }: ProjectListProps<Project>,
  ref: ForwardedRef<ProjectListHandle<Project>>,
) {
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedState, setFocusedState] = useState<string | undefined>(undefined);
  const [selectedState, setSelectedState] = useState<string[]>(defaultSelected);
  const selected = new Set(selectedProp ?? selectedState);
  const setSelected = (next: Set<string>) => {
    const ids = [...next];
    setSelectedState(ids);
    onSelectedChange?.(ids);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const isSelectedAt = (index: number) => {
    const project = projects[index];
    return project !== undefined && selected.has(project.id);
  };
  const count = projects.filter((project) => selected.has(project.id)).length;
  const indexOfId = useCallback(
    (id: string | undefined) =>
      id == null ? -1 : projects.findIndex((project) => project.id === id),
    [projects],
  );
  const ids = useMemo(() => projects.map((item) => item.id), [projects]);
  // when the focused row's item leaves the list, the row now in its place has focus
  const focusedId = useFocusedRowId(ids, focusedIdProp ?? focusedState);

  const virtualizer = useVirtualList({
    scrollerRef: listRef,
    count: projects.length,
    estimateSize: () => SIZE['row-height'],
    getItemKey: (index) => projects[index].id,
    onEndReached,
    endReachedThreshold,
  });

  // the rows drawn right now, by project id; a row asked to take focus before it is drawn waits in
  // pendingFocus until scrollToIndex brings it in
  const rows = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocus.current;
    const row = id ? rows.current.get(id) : undefined;
    if (row) {
      pendingFocus.current = null;
      row.focus({ preventScroll: true });
    }
  });

  function setFocused(id: string) {
    setFocusedState(id);
    onFocusedIdChange?.(id);
  }

  function focusProject(id: string) {
    setFocused(id);
    const index = indexOfId(id);
    const row = rows.current.get(id);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
    if (row) row.focus({ preventScroll: true });
    else pendingFocus.current = id;
  }
  const rowDetached = useRefocusOnRemoval({
    listRef,
    rows,
    has: (id) => indexOfId(id) >= 0,
    focusedId,
    focus: focusProject,
  });

  useImperativeHandle(ref, () => {
    const focusAt = (index: number) => {
      if (projects.length === 0) return;
      focusProject(projects[Math.max(0, Math.min(projects.length - 1, index))].id);
    };
    return {
      focusedItem: () => projects[indexOfId(focusedId)],
      selectedItems: () => projects.filter((project) => selected.has(project.id)),
      moveFocus: (by) => focusAt(Math.max(0, indexOfId(focusedId)) + by),
      focusFirst: () => focusAt(0),
      focusLast: () => focusAt(projects.length - 1),
      toggleSelected: () => {
        if (focusedId) toggle(focusedId);
      },
      clearSelection: () => setSelected(new Set()),
    };
  });

  // tabbing into the list while its focused row is scrolled away brings that row back
  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    onFocus?.(event);
    if (event.target === event.currentTarget && focusedId) focusProject(focusedId);
  }

  const items = virtualizer.getVirtualItems();
  const focusedDrawn = items.some((item) => projects[item.index]?.id === focusedId);

  return (
    <ScrollArea
      className={cn(styles.list, className)}
      style={style}
      viewportRef={listRef}
      viewportClassName={styles.viewport}
      viewportProps={{
        role: 'grid',
        'aria-multiselectable': true,
        'aria-rowcount': rowCount ?? projects.length,
        tabIndex: focusedDrawn || !focusedId ? -1 : 0,
        onFocus: handleFocus,
        ...props,
      }}
    >
      <div
        className={styles.rows}
        style={{ height: virtualizer.getTotalSize(), paddingTop: paddingBefore(items) }}
      >
        {items.map((item) => {
          const project = projects[item.index];
          if (!project) return null;
          const id = project.id;
          const on = isSelectedAt(item.index);
          return (
            <ProjectRow
              key={item.key}
              ref={(el) => {
                virtualizer.measureElement(el);
                if (el) rows.current.set(id, el);
                else {
                  rowDetached(id);
                  rows.current.delete(id);
                }
              }}
              data-index={item.index}
              data-project-id={id}
              aria-rowindex={item.index + 1}
              project={project}
              stats={project.stats}
              tabIndex={id === focusedId ? 0 : -1}
              onFocus={() => {
                if (id !== focusedId) setFocused(id);
              }}
              selected={on}
              selecting={count > 0}
              joinPrev={on && isSelectedAt(item.index - 1)}
              joinNext={on && isSelectedAt(item.index + 1)}
              onSelect={() => toggle(id)}
              onOpen={onOpen && (() => onOpen(project))}
            />
          );
        })}
      </div>
    </ScrollArea>
  );
}

export const ProjectList = forwardRef(ProjectListInner) as <
  Project extends ProjectListRow = ProjectListRow,
>(
  props: ProjectListProps<Project> & { ref?: Ref<ProjectListHandle<Project>> },
) => ReactElement;
