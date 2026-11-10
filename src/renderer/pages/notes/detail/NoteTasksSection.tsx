import { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, Plus } from 'lucide-react';
import type { NoteId, TaskId } from '@common/ids';
import type { TaskListItem } from '@common/types';
import {
  Badge,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DetailSection,
  SheetDivider,
  TaskList,
  type TaskListHandle,
} from '../../../components';
import { KeyScope, useListCommands } from '../../../keyboard';
import { useOpenEntity } from '../../app/use-open-entity';
import { TaskMenuItems } from '../../tasks/menus/TaskMenus';
import { useTaskActions } from '../../tasks/use-task-actions';
import { TaskPicker } from '../menus/NoteMenus';
import { noteTasksQuery } from '../queries';
import styles from './NotePage.module.css';

export interface NoteTasksSectionProps {
  noteId: NoteId;
  /** "New Task": Create task, linked to the note */
  onNewTask: () => void;
  /** "Link Task": links an existing task to the note */
  onLinkTask: (id: TaskId) => void;
}

/**
 * A note's Tasks (Figma `7158:16863`): the tasks made from it (`linkedNoteId`), collapsible, with
 * "Link Task" and "+ New Task". Each row changes status at once and opens on click, with the row
 * menu on right-click and the list keys. With no tasks the section is left out: the page's
 * "+ Add task" pill offers both instead.
 */
export function NoteTasksSection({ noteId, onNewTask, onLinkTask }: NoteTasksSectionProps) {
  const query = useInfiniteQuery(noteTasksQuery(noteId));
  // a row's note pill would only name this page
  const tasks = useMemo<TaskListItem[]>(
    () =>
      query.data?.pages.flatMap((page) =>
        page.items.map((item) => (item.link?.type === 'note' ? { ...item, link: null } : item)),
      ) ?? [],
    [query.data],
  );
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id as string, t])), [tasks]);
  const full = (rows: readonly { id: string }[]) => rows.flatMap((row) => byId.get(row.id) ?? []);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const list = useRef<TaskListHandle>(null);
  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);

  useListCommands(list, {
    open: (row) => openEntity({ id: row.id }),
    setStatus: (rows, status) => actions.setStatus(full(rows), status),
    toggleFavorite: (rows) => actions.toggleFavorite(full(rows)),
    trash: (rows) => void actions.trash(full(rows)),
  });

  if (tasks.length === 0) return null;
  return (
    <>
      <SheetDivider className={styles.divider} />
      <DetailSection
        collapsible
        spacing="page"
        title="Tasks"
        count={<Badge variant="secondary">{tasks.length}</Badge>}
        data-testid="note-tasks"
        action={
          <>
            <TaskPicker
              exclude={new Set(byId.keys())}
              onPick={onLinkTask}
              trigger={
                <Button size="xs" variant="ghost" icon={Link}>
                  Link Task
                </Button>
              }
            />
            <Button size="xs" icon={Plus} onClick={onNewTask}>
              New Task
            </Button>
          </>
        }
      >
        <ContextMenu>
          <ContextMenuTrigger
            style={{ display: 'contents' }}
            onContextMenu={(event) => {
              const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
              const found = row ? (byId.get(row.dataset.taskId ?? '') ?? null) : null;
              setMenuTask(found);
              if (!found) event.preventDefault();
            }}
          >
            <KeyScope name="list">
              <TaskList
                ref={list}
                tasks={tasks}
                selectionBar={false}
                onEndReached={() => {
                  if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
                }}
                onStatusChange={(row, status) => actions.setStatus(full([row]), status)}
                onDueDateChange={(row, date) => actions.setDueDate(full([row]), date)}
                onOpen={(row) => openEntity({ id: row.id })}
              />
            </KeyScope>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {menuTask && (
              <TaskMenuItems
                task={byId.get(menuTask.id) ?? menuTask}
                actions={actions}
                onOpen={() => openEntity({ id: menuTask.id })}
              />
            )}
          </ContextMenuContent>
        </ContextMenu>
      </DetailSection>
    </>
  );
}
