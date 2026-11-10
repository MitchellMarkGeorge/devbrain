import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { Calendar, CircleAlert, CircleSlash, Folder } from 'lucide-react';
import { TaskPriority, TaskStatus, type Page, type TaskListItem } from '@common/types';
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
} from '../../../../components';
import { trpc } from '../../../../ipc';
import { groupDefs, PRIMED_GROUPS, type TaskGroupDef } from './groups';
import { taskListQuery } from '../../queries';
import {
  hasFilters,
  taskListInput,
  type ResolvedTasksSearch,
  type TasksSearch,
} from '../../search';
import { TaskListFrame } from '../TaskListFrame';
import { TasksEmptyState, TasksErrorState, TasksLoading } from '../TasksStates';
import { useCreateTask } from '../../create/use-create-task';
import styles from '../TasksView.module.css';

export interface TasksGroupsProps {
  resolved: ResolvedTasksSearch;
  search: TasksSearch;
  onClearFilters: () => void;
}

/** What a group's query holds, reported up to the view. */
interface GroupState {
  tasks: TaskListItem[];
  pending: boolean;
  error: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
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

/**
 * One group's `tasks.list`, enabled once its heading has been on screen (the view is virtualized,
 * so a workspace with 40 projects queries the groups scrolled to, not all 40) and while it is
 * expanded. Draws nothing: it reports its rows to the view.
 */
function GroupQuery({
  def,
  resolved,
  enabled,
  onState,
}: {
  def: TaskGroupDef;
  resolved: ResolvedTasksSearch;
  enabled: boolean;
  onState: (id: string, state: GroupState) => void;
}) {
  const { now } = useFormat();
  const query = useInfiniteQuery({
    ...taskListQuery(taskListInput(resolved, now, def.filter)),
    enabled,
  });
  const { data, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = query;
  useEffect(() => {
    onState(def.id, {
      tasks: data?.pages.flatMap((page) => page.items) ?? [],
      pending: isPending,
      error: isError,
      hasNextPage,
      fetchNextPage: () => {
        if (!isFetchingNextPage) void fetchNextPage();
      },
    });
  }, [def.id, data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage, onState]);
  return null;
}

/**
 * A group's rows as the cache holds them, for the frame before its `GroupQuery` reports: the route's
 * loader has loaded the first groups, so the view draws them at once instead of empty.
 */
function cachedState(data: InfiniteData<Page<TaskListItem>> | undefined): GroupState | undefined {
  if (!data) return undefined;
  return {
    tasks: data.pages.flatMap((page) => page.items),
    pending: false,
    error: false,
    hasNextPage: data.pages[data.pages.length - 1]?.nextCursor != null,
    // the group's own query takes over on the next frame
    fetchNextPage: () => {},
  };
}

/** Marks its group seen once its heading is drawn. */
function Seen({
  id,
  onSeen,
  children,
}: {
  id: string;
  onSeen: (id: string) => void;
  children: ReactNode;
}) {
  useEffect(() => onSeen(id), [id, onSeen]);
  return children;
}

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

function Heading({
  def,
  state,
  collapsed,
  onCollapsedChange,
  onAddTask,
}: {
  def: TaskGroupDef;
  state: GroupState | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onAddTask: () => void;
}) {
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
 * project, status, priority or due date), each group its own `tasks.list` mounted once it comes
 * on screen. A group loads more with "Show more"; collapsed groups are remembered per grouping;
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

  const [reported, setStates] = useState<Record<string, GroupState>>({});
  // each group's rows: as its query reports them, or until then, as the cache holds them
  const states: Record<string, GroupState | undefined> = {};
  for (const def of defs) {
    states[def.id] =
      reported[def.id] ??
      cachedState(
        queryClient.getQueryData(
          taskListQuery(taskListInput(resolved, now, def.filter)).queryKey,
        ) as InfiniteData<Page<TaskListItem>> | undefined,
      );
  }
  const onState = useCallback(
    (id: string, state: GroupState) => setStates((current) => ({ ...current, [id]: state })),
    [],
  );
  const [seenOnScreen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  // the groups whose query runs: the first few, and those whose heading has been on screen
  const seen = { has: (id: string) => primed.has(id) || seenOnScreen.has(id) };
  const onSeen = useCallback(
    (id: string) => setSeen((current) => (current.has(id) ? current : new Set(current).add(id))),
    [],
  );
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
        <Seen id={def.id} onSeen={onSeen}>
          <Heading
            def={def}
            state={state}
            collapsed={isCollapsed}
            onCollapsedChange={(value) => toggle(def.id, value)}
            onAddTask={() => createTask({ defaults: def.defaults })}
          />
        </Seen>
      ),
      tasks: state?.tasks ?? [],
      footer: loading ? (
        <TaskRowSkeleton />
      ) : state?.hasNextPage ? (
        <div className={styles.more}>
          <Button size="xs" variant="ghost" onClick={state.fetchNextPage}>
            Show more
          </Button>
        </div>
      ) : undefined,
    };
  });

  const queries = defs.map((def) => (
    <GroupQuery
      key={def.id}
      def={def}
      resolved={resolved}
      enabled={seen.has(def.id) && !collapsed.includes(def.id)}
      onState={onState}
    />
  ));

  if (resolved.groupBy === 'project' && projects.isPending) return <TasksLoading />;
  // until the first groups have loaded (a collapsed one doesn't load)
  const priming = defs.some(
    (def) =>
      primed.has(def.id) &&
      !collapsed.includes(def.id) &&
      (!states[def.id] || states[def.id]!.pending),
  );
  if (priming) {
    return (
      <>
        {queries}
        <TasksLoading />
      </>
    );
  }
  if (resolved.groupBy === 'project' && projects.isError) {
    return <TasksErrorState onRetry={() => void projects.refetch()} />;
  }
  const everyLoadedEmpty =
    defs.length > 0 &&
    defs.every((def) => seen.has(def.id) && states[def.id] && !states[def.id]!.pending) &&
    shown.length === 0;
  if (everyLoadedEmpty) {
    return (
      <>
        {queries}
        <TasksEmptyState filtered={hasFilters(search)} onClearFilters={onClearFilters} />
      </>
    );
  }
  if (defs.length > 0 && defs.every((def) => states[def.id]?.error)) {
    return (
      <>
        {queries}
        <TasksErrorState
          onRetry={() => void queryClient.refetchQueries({ queryKey: trpc.tasks.list.pathKey() })}
        />
      </>
    );
  }
  return (
    <>
      {queries}
      <TaskListFrame loaded={loaded} groups={groups} />
    </>
  );
}
