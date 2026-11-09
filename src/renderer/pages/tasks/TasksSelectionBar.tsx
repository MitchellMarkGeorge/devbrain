import { Calendar, ChevronsUp, Circle, Folder, Star, Trash2 } from 'lucide-react';
import type { TaskListItem, TaskStatus } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuFilter,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PriorityMenuContent,
  SelectionBar,
  StatusMenuContent,
} from '../../components';
import { DateItems, ProjectItems } from './TaskMenus';
import type { TaskActions } from './use-task-actions';
import styles from './TasksView.module.css';

export interface TasksSelectionBarProps {
  /** the selected tasks, loaded */
  tasks: TaskListItem[];
  actions: TaskActions;
  onClear: () => void;
}

// a SelectionBar action that opens a menu: `menu` is its popup
function MenuAction({
  icon,
  label,
  menu,
}: {
  icon: typeof Circle;
  label: string;
  menu: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" icon={icon} />}>
        {label}
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  );
}

const ABOVE = { side: 'top', align: 'start', sideOffset: 8 } as const;

/**
 * The selection bar (Figma `7424:38163`) over the list and group views: the count, then Status,
 * Priority, Due date and Move for every selected task at once (`tasks.updateMany`, all or
 * nothing), a "more" menu with Favorite and Move to trash (`archive.archiveTasks`), and clear.
 */
export function TasksSelectionBar({ tasks, actions, onClear }: TasksSelectionBarProps) {
  if (tasks.length === 0) return null;
  const done = (run: () => unknown) => () => {
    run();
  };
  return (
    <div className={styles.bar}>
      <SelectionBar
        count={tasks.length}
        floating={false}
        onClear={onClear}
        actions={
          <>
            <MenuAction
              icon={Circle}
              label="Status"
              menu={
                <StatusMenuContent
                  {...ABOVE}
                  status={0 as TaskStatus}
                  onPick={(status) => actions.setStatus(tasks, status)}
                />
              }
            />
            <MenuAction
              icon={ChevronsUp}
              label="Priority"
              menu={
                <PriorityMenuContent
                  {...ABOVE}
                  priority={undefined}
                  onPick={(priority) => actions.setPriority(tasks, priority)}
                />
              }
            />
            <MenuAction
              icon={Calendar}
              label="Due date"
              menu={
                <DropdownMenuContent {...ABOVE} width="sm">
                  <DateItems onPick={(date) => actions.setDueDate(tasks, date)} />
                </DropdownMenuContent>
              }
            />
            <DropdownMenuFilter>
              <MenuAction
                icon={Folder}
                label="Move"
                menu={
                  <DropdownMenuContent {...ABOVE} width="lg">
                    <ProjectItems
                      projectId={undefined}
                      onPick={(id) => actions.setProject(tasks, id)}
                    />
                  </DropdownMenuContent>
                }
              />
            </DropdownMenuFilter>
          </>
        }
        more={
          <>
            <DropdownMenuItem icon={Star} onClick={done(() => actions.toggleFavorite(tasks))}>
              {tasks.every((task) => task.favoritedAt) ? 'Unfavorite' : 'Favorite'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={Trash2}
              shortcut="⌘⌫"
              variant="destructive"
              onClick={() => {
                void actions.trash(tasks).then((moved) => {
                  if (moved) onClear();
                });
              }}
            >
              Move to trash
            </DropdownMenuItem>
          </>
        }
      />
    </div>
  );
}
