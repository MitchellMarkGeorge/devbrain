import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageContent } from '../../ui/PageHeader';
import { TaskRow } from '../../ui/TaskRow';
import { ScreenFrame } from './AppFrame';
import { FIGMA_TASKS, TasksHeader, TasksToolbar } from './fixtures';

const meta = {
  title: 'Screens/Shell/Tasks list',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function TasksPage({ compact = false, hovered }: { compact?: boolean; hovered?: number }) {
  return (
    <>
      <TasksToolbar compact={compact} />
      <PageContent layout="list">
        {FIGMA_TASKS.map((task, i) => (
          <TaskRow key={task.id} task={task} state={i === hovered ? 'hover' : undefined} />
        ))}
      </PageContent>
    </>
  );
}

/** Figma "Tasks (list)" (7155:5231): the full sidebar with its window row. */
export const Expanded: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />}>
      <TasksPage hovered={3} />
    </ScreenFrame>
  ),
};

/**
 * Figma "Tasks (list) — sidebar collapsed" (7167:14126): the 56px rail under the window bar,
 * which carries the breadcrumb. Point at a rail item for its tooltip and shortcut.
 */
export const SidebarCollapsed: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />} defaultCollapsed>
      <TasksPage hovered={2} />
    </ScreenFrame>
  ),
};

/** Figma 7608:44744: at 960 × 640 the sidebar rests as the rail and the toolbar values hide. */
export const CompactRail: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />} width={960} height={640}>
      <TasksPage compact hovered={2} />
    </ScreenFrame>
  ),
};

/**
 * Figma 7611:46744: expanding the rail in a compact window opens the full sidebar as a drawer
 * over the page, with the backdrop behind it. Picking a page, clicking outside or Esc closes it.
 */
export const CompactDrawer: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />} width={960} height={640} defaultDrawerOpen>
      <TasksPage compact hovered={2} />
    </ScreenFrame>
  ),
};
