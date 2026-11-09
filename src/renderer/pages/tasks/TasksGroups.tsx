import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, CircleSlash, Folder } from 'lucide-react';
import type { ProjectId } from '@common/ids';
import type { TaskListItem } from '@common/types';
import {
  Button,
  GroupHeading,
  PriorityIcon,
  resolveColor,
  StatusIcon,
  TaskRowSkeleton,
  useFormat,
  type TaskListGroup,
} from '../../components';
import { trpc } from '../../ipc';
import { groupDefs, type TaskGroupDef } from './groups';
import { taskListQuery } from './queries';
import { taskListInput, type ResolvedTasksSearch, type TasksSearch } from './search';
import { TaskListFrame } from './TaskListFrame';
import { TasksEmpty, TasksError, TasksLoading } from './TasksListStates';
import { useCreateTask } from './use-create-task';
import styles from './TasksView.module.css';

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

function groupIcon(def: TaskGroupDef) {
  switch (def.look.icon) {
    case 'status':
      return def.look.status ? <StatusIcon status={def.look.status} /> : undefined;
    case 'priority':
      return def.look.priority ? <PriorityIcon priority={def.look.priority} /> : undefined;
    case 'project':
      return Folder;
    case 'due':
      return Calendar;
    default:
      return CircleSlash;
  }
}

/** A project group's done/total, from `projects.stats` (one per drawn heading). */
function useProjectProgress(projectId: ProjectId | undefined) {
  const stats = useQuery({
    ...trpc.projects.stats.queryOptions({ id: projectId as ProjectId }),
    enabled: projectId !== undefined,
  });
  return stats.data && { done: stats.data.numOfCompleted, total: stats.data.totalTasks };
}

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
  const progress = useProjectProgress(def.projectId);
  const loaded = state && !state.pending ? state.tasks.length : undefined;
  return (
    <GroupHeading
      label={def.label}
      subtitle={def.subtitle}
      icon={groupIcon(def)}
      iconColor={def.look.icon === 'project' ? resolveColor(def.look.color, 'blue') : undefined}
      done={progress?.done}
      total={progress?.total}
      count={progress ? undefined : state?.hasNextPage ? undefined : loaded}
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

  const [states, setStates] = useState<Record<string, GroupState>>({});
  const onState = useCallback(
    (id: string, state: GroupState) => setStates((current) => ({ ...current, [id]: state })),
    [],
  );
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
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
  const loaded = useMemo(() => Object.values(states).flatMap((state) => state.tasks), [states]);

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
  if (resolved.groupBy === 'project' && projects.isError) {
    return <TasksError onRetry={() => void projects.refetch()} />;
  }
  const everyLoadedEmpty =
    defs.length > 0 &&
    defs.every((def) => seen.has(def.id) && states[def.id] && !states[def.id].pending) &&
    shown.length === 0;
  if (everyLoadedEmpty) {
    return (
      <>
        {queries}
        <TasksEmpty search={search} onClearFilters={onClearFilters} />
      </>
    );
  }
  if (defs.length > 0 && defs.every((def) => states[def.id]?.error)) {
    return (
      <>
        {queries}
        <TasksError
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
