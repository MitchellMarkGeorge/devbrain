import type { ReactNode } from 'react';
import {
  Calendar,
  ChevronsDownUp,
  ChevronsUp,
  ChevronsUpDown,
  Circle,
  CircleSlash,
  CornerDownRight,
  Folder,
  SquareArrowOutUpRight,
  Star,
  Trash2,
} from 'lucide-react';
import type { ProjectId } from '@common/ids';
import type { TaskListItem, TaskPriority, TaskStatus } from '@common/types';
import {
  defaultQuickPicks,
  DropdownMenuFilter,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  NO_PROJECT,
  PriorityMenuContent,
  ProjectPickerItems,
  StatusMenuContent,
  useFormat,
} from '../../../components';
import { useOpenEntity } from '../../app/use-open-entity';
import { useProjectOptions } from './use-project-options';
import { isSynced } from '../queries';
import type { TaskActions } from '../use-task-actions';

// The tasks pages' menus (Figma 7175:24999), built from DropdownMenu parts: the row's right-click
// menu, and the submenus the selection bar shares with it. They work in a DropdownMenu and a
// ContextMenu alike (a context menu's parts are the dropdown's).

const TRASH = '⌘⌫';

/** Status › */
export function StatusSubmenu({
  status,
  disabled,
  onPick,
}: {
  status: TaskStatus | undefined;
  disabled?: boolean;
  onPick: (status: TaskStatus) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger icon={Circle} disabled={disabled}>
        Status
      </DropdownMenuSubTrigger>
      <StatusMenuContent submenu status={status ?? (0 as TaskStatus)} onPick={onPick} />
    </DropdownMenuSub>
  );
}

/** Priority › */
export function PrioritySubmenu({
  priority,
  disabled,
  onPick,
}: {
  priority: TaskPriority | undefined;
  disabled?: boolean;
  onPick: (priority: TaskPriority) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger icon={ChevronsUp} disabled={disabled}>
        Priority
      </DropdownMenuSubTrigger>
      <PriorityMenuContent submenu priority={priority} onPick={onPick} />
    </DropdownMenuSub>
  );
}

/** The quick dates (Today, Tomorrow, Next week) and "No date", as a date submenu's items. */
export function DateItems({ onPick }: { onPick: (date: Date | null) => void }) {
  const { now } = useFormat();
  return (
    <>
      {defaultQuickPicks(now).map((pick) => (
        <DropdownMenuItem
          key={String(pick.label)}
          icon={Calendar}
          onClick={() => onPick(pick.date)}
        >
          {pick.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={CircleSlash} onClick={() => onPick(null)}>
        No date
      </DropdownMenuItem>
    </>
  );
}

/** Start date › or Due date › */
export function DateSubmenu({
  label,
  disabled,
  onPick,
}: {
  label: ReactNode;
  disabled?: boolean;
  onPick: (date: Date | null) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger icon={Calendar} disabled={disabled}>
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent width="sm">
        <DateItems onPick={onPick} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** The project picker's items (a search, the projects, "No project"), for a menu or submenu. */
export function ProjectItems({
  projectId,
  onPick,
}: {
  projectId: ProjectId | null | undefined;
  onPick: (projectId: ProjectId | null) => void;
}) {
  const projects = useProjectOptions();
  return (
    <ProjectPickerItems
      projects={projects}
      value={projectId === undefined ? undefined : (projectId ?? NO_PROJECT)}
      onValueChange={(value) => onPick(value === NO_PROJECT ? null : (value as ProjectId))}
    />
  );
}

/** Move › (a project) */
export function ProjectSubmenu({
  projectId,
  label = 'Move to project',
  disabled,
  onPick,
}: {
  projectId: ProjectId | null | undefined;
  label?: ReactNode;
  disabled?: boolean;
  onPick: (projectId: ProjectId | null) => void;
}) {
  return (
    <DropdownMenuFilter>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger icon={Folder} disabled={disabled}>
          {label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent width="lg">
          <ProjectItems projectId={projectId} onPick={onPick} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuFilter>
  );
}

export interface TaskMenuItemsProps {
  task: TaskListItem;
  actions: TaskActions;
  /** "Open task": its page, or the board's sheet */
  onOpen: () => void;
  /** a list row with subtasks under it: "Show subtasks" or "Hide subtasks" */
  subtasks?: { shown: boolean; onToggle: () => void };
}

/**
 * A task's menu (right-click on a row or card): Open, Status ›, Priority ›, Start date ›, Due
 * date ›, Favorite, Open parent task, Open project, Move to trash. A synced task's mirrored fields
 * are drawn disabled.
 */
export function TaskMenuItems({ task, actions, onOpen, subtasks }: TaskMenuItemsProps) {
  const openEntity = useOpenEntity();
  const synced = isSynced(task);
  const tasks = [task];
  return (
    <>
      <DropdownMenuItem icon={SquareArrowOutUpRight} shortcut="↵" onClick={onOpen}>
        Open task
      </DropdownMenuItem>
      {subtasks && (
        <DropdownMenuItem
          icon={subtasks.shown ? ChevronsDownUp : ChevronsUpDown}
          shortcut={subtasks.shown ? '←' : '→'}
          onClick={subtasks.onToggle}
        >
          {subtasks.shown ? 'Hide subtasks' : 'Show subtasks'}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <StatusSubmenu
        status={task.status}
        disabled={synced}
        onPick={(status) => actions.setStatus(tasks, status)}
      />
      <PrioritySubmenu
        priority={task.priority}
        disabled={synced}
        onPick={(priority) => actions.setPriority(tasks, priority)}
      />
      <DateSubmenu
        label="Start date"
        disabled={synced}
        onPick={(date) => actions.setStartDate(task, date)}
      />
      <DateSubmenu
        label="Due date"
        disabled={synced}
        onPick={(date) => actions.setDueDate(tasks, date)}
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Star} shortcut="F" onClick={() => actions.toggleFavorite(tasks)}>
        {task.favoritedAt ? 'Unfavorite' : 'Favorite'}
      </DropdownMenuItem>
      {task.parentTask && (
        <DropdownMenuItem
          icon={CornerDownRight}
          onClick={() => task.parentTask && openEntity({ id: task.parentTask.id })}
        >
          Open parent task
        </DropdownMenuItem>
      )}
      {task.project && (
        <DropdownMenuItem
          icon={Folder}
          onClick={() => task.project && openEntity({ id: task.project.id })}
        >
          Open project
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        icon={Trash2}
        shortcut={TRASH}
        variant="destructive"
        disabled={synced}
        onClick={() => void actions.trash(tasks)}
      >
        Move to trash
      </DropdownMenuItem>
    </>
  );
}
