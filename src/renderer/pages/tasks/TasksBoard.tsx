import type { TaskId } from '@common/ids';
import type { ResolvedTasksSearch } from './search';

export interface TasksBoardProps {
  resolved: ResolvedTasksSearch;
  /** shows a task in the sheet (`?open=tsk_…`) */
  onOpen: (id: TaskId) => void;
}

/** The board view (Figma `7158:14338`): a virtualized column per status. */
export function TasksBoard(props: TasksBoardProps) {
  void props;
  return null;
}
