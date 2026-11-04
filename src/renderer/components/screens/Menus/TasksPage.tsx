/** The Tasks list page the menu screens open over, as in Figma's "Tasks (list)". */
import type { ReactNode } from 'react';
import { ArrowUpDown, Group, Kanban, List, ListFilter, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { TaskList, type TaskListProps } from '../../ui/TaskList';
import { ToggleGroup, ToggleGroupItem } from '../../ui/ToggleGroup';
import { LIST_TASKS } from '../Tasks/data';
import { AppFrame } from '../Tasks/frame';

export function TasksPage({
  states,
  filter,
  sort,
  children,
}: {
  states?: TaskListProps['states'];
  /** the Filter button, when a screen draws it open */
  filter?: ReactNode;
  /** the Sort button, when a screen draws it open */
  sort?: ReactNode;
  /** menus held open over the page */
  children?: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', width: 1440, height: 1024 }}>
      <AppFrame
        active="Tasks"
        breadcrumb={['Tasks', { label: 'List', icon: List }]}
        toolbarStart={
          filter ?? (
            <Button icon={ListFilter} value="Open">
              Filter
            </Button>
          )
        }
        toolbarEnd={
          <>
            {sort ?? (
              <Button icon={ArrowUpDown} value="Priority">
                Sort
              </Button>
            )}
            <ToggleGroup defaultValue="list" aria-label="View">
              <ToggleGroupItem value="list" icon={List} aria-label="List" />
              <ToggleGroupItem value="group" icon={Group} aria-label="Grouped" />
              <ToggleGroupItem value="board" icon={Kanban} aria-label="Board" />
            </ToggleGroup>
            <Button icon={Plus}>New Task</Button>
          </>
        }
      >
        <TaskList tasks={LIST_TASKS} states={states} />
      </AppFrame>
      {children}
    </div>
  );
}
