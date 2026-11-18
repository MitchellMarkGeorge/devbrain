import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageContent } from '../../shell/Page';
import { TaskRow } from '../../lists/TaskRow';
import { HomeScreen } from '../Home/HomeScreens';
import { ScreenFrame } from '../Shell/AppFrame';
import { FIGMA_TASKS, TasksToolbar } from '../Shell/fixtures';
import { RedesignSidebar } from './RedesignSidebar';

const meta = {
  title: 'Screens/Proposals/Sidebar redesign',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Home, renamed Today, leads; Pinned, Projects with counts, saved views, then all items. */
export const Today: Story = {
  render: () => <HomeScreen title="Today" sidebar={<RedesignSidebar active="Today" />} />,
};

/** A project picked from the sidebar: its tasks; pointing at another project shows its "+". */
export const Project: Story = {
  render: () => (
    <ScreenFrame
      title="Auth Overhaul"
      sidebar={<RedesignSidebar active="project:Auth Overhaul" hover="API Gateway v2" />}
    >
      <TasksToolbar />
      <PageContent layout="list">
        {FIGMA_TASKS.filter((task) => task.project?.title === 'Auth Overhaul').map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </PageContent>
    </ScreenFrame>
  ),
};

/** Reordering Pinned by hand: the lifted row and the line where it lands. */
export const ReorderPinned: Story = {
  render: () => <HomeScreen title="Today" sidebar={<RedesignSidebar dragging />} />,
};

/** The app's default window, 1200 × 800, with a failed sync. */
export const DefaultWindow: Story = {
  render: () => (
    <HomeScreen
      width={1200}
      height={800}
      title="Today"
      sidebar={<RedesignSidebar sync="error" />}
    />
  ),
};

/** Today in the light theme. */
export const Light: Story = {
  globals: { theme: 'light' },
  render: () => <HomeScreen title="Today" sidebar={<RedesignSidebar />} />,
};
