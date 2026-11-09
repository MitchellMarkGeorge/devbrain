import type { ResolvedTasksSearch } from './search';

export interface TasksGroupsProps {
  resolved: ResolvedTasksSearch;
}

/** The group view (Figma `7158:9538`): one query per group, mounted while it is on screen. */
export function TasksGroups(props: TasksGroupsProps) {
  void props;
  return null;
}
