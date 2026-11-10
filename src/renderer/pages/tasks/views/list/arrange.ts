import type { TaskListItem } from '@common/types';

/**
 * The list views' rows in order: each subtask moved under its parent (after the parent's other
 * subtasks, in the sort's order) when the parent is among `tasks`, and left where the sort put it,
 * with its parent's pill, when it isn't (a parent the filter leaves out, or one on a page not
 * loaded yet). A parent in `collapsed` hides the subtasks under it. Figma's list draws a subtask
 * this way (`7155:5231`: "Mobile fallback" under "Implement OAuth2 PKCE flow").
 */
export function arrangeSubtasks(
  tasks: readonly TaskListItem[],
  collapsed: ReadonlySet<string> = new Set(),
): TaskListItem[] {
  const present = new Set(tasks.map((task) => task.id as string));
  const childrenOf = new Map<string, TaskListItem[]>();
  for (const task of tasks) {
    const parent = task.parentTaskId;
    if (parent && present.has(parent)) {
      const siblings = childrenOf.get(parent) ?? [];
      siblings.push(task);
      childrenOf.set(parent, siblings);
    }
  }
  const out: TaskListItem[] = [];
  const place = (task: TaskListItem, path: ReadonlySet<string>) => {
    out.push(task);
    if (collapsed.has(task.id) || path.has(task.id)) return;
    const next = new Set(path).add(task.id);
    for (const child of childrenOf.get(task.id) ?? []) place(child, next);
  };
  for (const task of tasks) {
    // a subtask under a parent in the list is placed with it
    if (task.parentTaskId && present.has(task.parentTaskId)) continue;
    place(task, new Set());
  }
  return out;
}

/** Whether a task has subtasks placed under it in `tasks`. */
export function hasPlacedSubtasks(task: TaskListItem, tasks: readonly TaskListItem[]): boolean {
  return tasks.some((other) => other.parentTaskId === task.id);
}
