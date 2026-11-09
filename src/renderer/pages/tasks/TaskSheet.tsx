import type { TaskId } from '@common/ids';

export interface TaskSheetProps {
  taskId: TaskId;
  /** closes the sheet (removes `open` from the URL) */
  onClose: () => void;
}

/**
 * The task sheet over the board (`?open=tsk_…`, Figma `7175:31599`): docked beside the board, or
 * floating in compact windows; its ⤢ opens the task's page.
 */
export function TaskSheet(props: TaskSheetProps) {
  void props;
  return null;
}
