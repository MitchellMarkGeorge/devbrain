import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageContent } from '../../shell/PageHeader';
import { TaskRow } from '../../lists/TaskRow';
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
 * The user hid the sidebar (Figma "Tasks (list) — sidebar collapsed", 7167:14126, still draws the
 * old icon rail): the window bar runs across the top and carries the breadcrumb. Point at the
 * sidebar toggle or the window's left edge to peek at the sidebar; click the toggle to dock it.
 */
export const SidebarCollapsed: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />} defaultCollapsed>
      <TasksPage hovered={2} />
    </ScreenFrame>
  ),
};

/**
 * At 960 × 640 the sidebar rests hidden and the toolbar values hide (Figma 7608:44744 still draws
 * the old icon rail). Point at the toggle or the left edge to peek; click the toggle to pin it.
 */
export const Compact: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />} width={960} height={640}>
      <TasksPage compact hovered={2} />
    </ScreenFrame>
  ),
};

/**
 * Figma 7611:46744: opening the hidden sidebar in a compact window shows it as a drawer over the
 * page, with the backdrop behind it. Picking a page, clicking outside or Esc closes it.
 */
export const CompactDrawer: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />} width={960} height={640} defaultDrawerOpen>
      <TasksPage compact hovered={2} />
    </ScreenFrame>
  ),
};
