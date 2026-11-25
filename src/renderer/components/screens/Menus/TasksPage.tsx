/** The Tasks list page the menu screens open over, as in Figma's "Tasks (list)". */
import type { ReactNode } from 'react';
import { List } from 'lucide-react';
import { DemoToolbarEnd, DemoToolbarStart } from '../../lists/ListToolbar/fixtures';
import { TaskList, type TaskListProps } from '../../lists/TaskList';
import { LIST_TASKS } from '../Tasks/data';
import { AppFrame } from '../Tasks/frame';

export function TasksPage({
  states,
  open,
  children,
}: {
  states?: TaskListProps['states'];
  /** one of the toolbar's menus, drawn open */
  open?: 'status' | 'filter' | 'display';
  /** menus held open over the page */
  children?: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', width: 1440, height: 1024 }}>
      <AppFrame
        active="Tasks"
        breadcrumb={['Tasks', { label: 'List', icon: List }]}
        toolbarStart={
          <DemoToolbarStart list="tasks" open={open === 'display' ? undefined : open} />
        }
        toolbarEnd={<DemoToolbarEnd list="tasks" open={open === 'display'} />}
      >
        <TaskList tasks={LIST_TASKS} states={states} />
      </AppFrame>
      {children}
    </div>
  );
}
