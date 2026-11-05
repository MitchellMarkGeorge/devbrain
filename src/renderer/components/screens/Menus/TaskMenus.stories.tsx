import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  LinkPillMenu,
  NoteMenu,
  OpenMenu,
  ProjectMenu,
  TaskContextMenu,
  TrashRowMenu,
} from './menus';
import { TasksPage } from './TasksPage';
import { PriorityMenuContent } from '../../entities/PriorityMenu';
import { StatusMenuContent } from '../../entities/StatusMenu';

const meta = {
  title: 'Screens/Menus/Row menus',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Figma "Tasks – task right-click menu" (7175:24999): the first row pointed at, its menu at the
 * pointer and Status › open, In progress ticked.
 */
export const TaskRightClick: Story = {
  name: 'Tasks – task right-click menu',
  render: () => (
    <TasksPage states={{ 0: 'hover' }}>
      <OpenMenu x={561} y={121}>
        <TaskContextMenu open="status" />
      </OpenMenu>
    </TasksPage>
  ),
};

/**
 * Every row menu of "R2 Batch 1: Menus & pickers": StatusMenu, PriorityMenu, TaskContextMenu,
 * LinkPillMenu (event, task note), TrashRowMenu, NoteMenu and ProjectMenu.
 */
export const Gallery: Story = {
  render: () => (
    <div
      style={{ position: 'relative', width: 1440, height: 760, background: 'var(--background)' }}
    >
      <OpenMenu x={40} y={40}>
        <StatusMenuContent status="in-progress" sideOffset={0} />
      </OpenMenu>
      <OpenMenu x={280} y={40}>
        <PriorityMenuContent priority="high" sideOffset={0} />
      </OpenMenu>
      <OpenMenu x={520} y={40}>
        <TaskContextMenu />
      </OpenMenu>
      <OpenMenu x={784} y={40}>
        <LinkPillMenu link="event" sideOffset={0} />
      </OpenMenu>
      <OpenMenu x={1032} y={40}>
        <LinkPillMenu link="task-note" sideOffset={0} />
      </OpenMenu>
      <OpenMenu x={784} y={200}>
        <TrashRowMenu />
      </OpenMenu>
      <OpenMenu x={40} y={400}>
        <NoteMenu />
      </OpenMenu>
      <OpenMenu x={1032} y={200}>
        <ProjectMenu />
      </OpenMenu>
    </div>
  ),
};
