import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, CircleAlert, CircleSlash, Folder } from 'lucide-react';
import type { ProjectId } from '@common/ids';
import { TaskPriority, TaskStatus, type TaskListItem } from '@common/types';
import {
  Button,
  GroupHeading,
  PriorityIcon,
  resolveColor,
  statusVar,
  StatusIcon,
  TaskRowSkeleton,
  useFormat,
  type TaskListGroup,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { groupDefs, PRIMED_GROUPS, type TaskGroupDef } from '../../../lib/groups';
import { groupTasksQuery, withoutProjectPill } from '../../../api/queries';
import {
  hasFilters,
  taskListInput,
  type ResolvedTasksSearch,
  type TasksSearch,
} from '../../../api/search';
import { TaskListFrame } from '../TaskListFrame';
import { TasksEmptyState, TasksErrorState, TasksLoading } from '../TasksStates';
import { useCreateTask } from '../../../hooks/use-create-task';
import styles from '../TasksView.module.css';

// a project's own groups (its page) file a new task in it
function projectDefault(resolved: ResolvedTasksSearch): { projectId?: ProjectId } {
  return resolved.project && resolved.project !== 'none' ? { projectId: resolved.project } : {};
}

export interface TasksGroupsProps {
  resolved: ResolvedTasksSearch;
  search: TasksSearch;
  onClearFilters: () => void;
}

/** What the view knows of a group's rows, from its query. */
interface GroupState {
  tasks: TaskListItem[];
  pending: boolean;
  error: boolean;
  hasNextPage: boolean;
}

// ---------- collapsed groups, per grouping, in localStorage ----------

const collapsedKey = (groupBy: string) => `devbrain.tasks.collapsed.${groupBy}`;

function readCollapsed(groupBy: string): string[] {
  try {
    const raw = window.localStorage.getItem(collapsedKey(groupBy));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeCollapsed(groupBy: string, ids: string[]) {
  try {
    window.localStorage.setItem(collapsedKey(groupBy), JSON.stringify(ids));
  } catch {
    // a private window: the groups open again next time
  }
}

// ---------- a group's data ----------

// the band's icon, 14px: a status or priority colours itself
function groupIcon(def: TaskGroupDef) {
  switch (def.look.icon) {
    case 'status':
      return def.look.status ? <StatusIcon status={def.look.status} size={14} /> : undefined;
    case 'priority':
      return def.look.priority ? (
        <PriorityIcon priority={def.look.priority} size={14} />
      ) : undefined;
    case 'project':
      return Folder;
    case 'due':
      return def.look.tone === 'overdue' ? CircleAlert : Calendar;
    default:
      return CircleSlash;
  }
}

// the colour that tints the band (GroupHeading.md, "Tint"); none for a neutral group
function groupColor(def: TaskGroupDef): string | undefined {
  const { look } = def;
  switch (look.icon) {
    case 'project':
      return resolveColor(look.color, 'blue');
    case 'status':
      return look.status && look.status !== TaskStatus.NOT_STARTED
        ? statusVar(look.status)
        : undefined;
    case 'priority':
      return look.priority ? `var(--priority-${PRIORITY_SLUGS[look.priority]})` : undefined;
    case 'due':
      return look.tone === 'overdue'
        ? 'var(--status-overdue)'
        : look.tone === 'today'
          ? 'var(--date-today)'
          : undefined;
    default:
      return undefined;
  }
}

const PRIORITY_SLUGS: Record<TaskPriority, string> = {
  [TaskPriority.HIGH]: 'high',
  [TaskPriority.MEDIUM]: 'medium',
  [TaskPriority.LOW]: 'low',
};

/**
 * A group's band. Drawn once it scrolls into the virtualized list's range, it marks its group seen,
 * which starts the group's query.
 */
function Heading({
  def,
  state,
  collapsed,
  onCollapsedChange,
  onAddTask,
  onSeen,
}: {
  def: TaskGroupDef;
  state: GroupState | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onAddTask: () => void;
  onSeen: (id: string) => void;
}) {
  useEffect(() => onSeen(def.id), [def.id, onSeen]);
  // the count once every page has loaded; none while more are to come
  const count = state && !state.pending && !state.hasNextPage ? state.tasks.length : undefined;
  return (
    <GroupHeading
      label={def.label}
      subtitle={def.subtitle}
      icon={groupIcon(def)}
      color={groupColor(def)}
      count={count}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      onAddTask={onAddTask}
    />
  );
}

/**
 * The group view (Figma `7158:9538`): one virtualized `TaskList` with a heading per group (by
 * project, status, priority or due date), each group its own query (`groupTasksQuery`, all of them
 * in one `useQueries`), run for the first groups and for each one once its heading has been on
 * screen. A group loads more with "Show more"; collapsed groups are remembered per grouping;
 * "Add task" in a heading opens Create task with the group's project, status, priority or date. A
 * project group with no tasks for these filters is left out once it has loaded.
 */
export function TasksGroups({ resolved, search, onClearFilters }: TasksGroupsProps) {
  const { now } = useFormat();
  const createTask = useCreateTask();
  const queryClient = useQueryClient();
  const projects = useQuery({
    ...trpc.projects.list.queryOptions({ limit: 200 }),
    enabled: resolved.groupBy === 'project',
  });
  const defs = useMemo(
    () => groupDefs(resolved, now, projects.data?.items ?? []),
    [resolved, now, projects.data],
  );
  const primed = new Set(defs.slice(0, PRIMED_GROUPS).map((def) => def.id));

  const [seenOnScreen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  // the groups whose query runs: the first few, and those whose heading has been on screen
  const seen = { has: (id: string) => primed.has(id) || seenOnScreen.has(id) };
  const onSeen = useCallback(
    (id: string) => setSeen((current) => (current.has(id) ? current : new Set(current).add(id))),
    [],
  );
  // how many pages each group has shown; "Show more" adds one
  const [pages, setPages] = useState<Readonly<Record<string, number>>>({});
  // the grouping's collapsed groups, read again when the grouping changes
  const [collapsedState, setCollapsedState] = useState(() => ({
    groupBy: resolved.groupBy,
    ids: readCollapsed(resolved.groupBy),
  }));
  if (collapsedState.groupBy !== resolved.groupBy) {
    setCollapsedState({ groupBy: resolved.groupBy, ids: readCollapsed(resolved.groupBy) });
  }
  const collapsed = collapsedState.ids;
  const toggle = (id: string, value: boolean) => {
    const next = value ? [...new Set([...collapsed, id])] : collapsed.filter((c) => c !== id);
    setCollapsedState({ groupBy: resolved.groupBy, ids: next });
    writeCollapsed(resolved.groupBy, next);
  };

  // every group's rows, read from the cache on the first render (the route's loader loads the
  // first groups), so the view never draws a frame without them
  const results = useQueries({
    queries: defs.map((def) => {
      const input = taskListInput(resolved, now, def.filter);
      const shownPages = pages[def.id] ?? 1;
      return {
        ...groupTasksQuery(input, shownPages),
        enabled: seen.has(def.id) && !collapsed.includes(def.id),
        // while "Show more" loads the next page, the pages shown so far stay on screen
        placeholderData: () =>
          shownPages > 1
            ? queryClient.getQueryData(groupTasksQuery(input, shownPages - 1).queryKey)
            : undefined,
      };
    }),
  });
  const states: Record<string, GroupState | undefined> = {};
  defs.forEach((def, index) => {
    const result = results[index];
    states[def.id] = {
      tasks: result.data?.items ?? [],
      pending: result.isPending,
      error: result.isError,
      hasNextPage: (result.data?.nextCursor ?? null) !== null,
    };
  });
  const showMore = (id: string) =>
    setPages((current) => ({ ...current, [id]: (current[id] ?? 1) + 1 }));

  // a group loaded empty is left out; one not yet loaded keeps its heading
  const shown = defs.filter((def) => {
    const state = states[def.id];
    return !(
      seen.has(def.id) &&
      state &&
      !state.pending &&
      !state.error &&
      state.tasks.length === 0
    );
  });
  const loaded = Object.values(states).flatMap((state) => state?.tasks ?? []);

  const groups: TaskListGroup[] = shown.map((def) => {
    const state = states[def.id];
    const isCollapsed = collapsed.includes(def.id);
    const loading = seen.has(def.id) && (!state || state.pending);
    return {
      id: def.id,
      collapsed: isCollapsed,
      heading: (
        <Heading
          def={def}
          state={state}
          collapsed={isCollapsed}
          onCollapsedChange={(value) => toggle(def.id, value)}
          onAddTask={() =>
            createTask({ defaults: { ...projectDefault(resolved), ...def.defaults } })
          }
          onSeen={onSeen}
        />
      ),
      tasks: withoutProjectPill(state?.tasks ?? [], resolved.project),
      footer: loading ? (
        <TaskRowSkeleton />
      ) : state?.hasNextPage ? (
        <div className={styles.more}>
          <Button
            size="xs"
            variant="ghost"
            disabled={results[defs.indexOf(def)]?.isFetching}
            onClick={() => showMore(def.id)}
          >
            Show more
          </Button>
        </div>
      ) : undefined,
    };
  });

  if (resolved.groupBy === 'project' && projects.isPending) return <TasksLoading />;
  // until the first groups have loaded (a collapsed one doesn't load)
  const priming = defs.some(
    (def) =>
      primed.has(def.id) &&
      !collapsed.includes(def.id) &&
      (!states[def.id] || states[def.id]!.pending),
  );
  if (priming) {
    return <TasksLoading />;
  }
  if (resolved.groupBy === 'project' && projects.isError) {
    return <TasksErrorState onRetry={() => void projects.refetch()} />;
  }
  const everyLoadedEmpty =
    defs.length > 0 &&
    defs.every((def) => seen.has(def.id) && states[def.id] && !states[def.id]!.pending) &&
    shown.length === 0;
  if (everyLoadedEmpty) {
    return <TasksEmptyState filtered={hasFilters(search)} onClearFilters={onClearFilters} />;
  }
  if (defs.length > 0 && defs.every((def) => states[def.id]?.error)) {
    return (
      <TasksErrorState
        onRetry={() => void queryClient.refetchQueries({ queryKey: trpc.tasks.list.pathKey() })}
      />
    );
  }
  return <TaskListFrame loaded={loaded} groups={groups} />;
}
