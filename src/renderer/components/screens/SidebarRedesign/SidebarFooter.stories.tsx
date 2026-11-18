import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { PageContent } from '../../shell/Page';
import { TaskRow } from '../../lists/TaskRow';
import { Sidebar, SidebarFooter } from '../../shell/Sidebar';
import type { SyncState } from '../../shell/SyncStatus';
import { ScreenFrame } from '../Shell/AppFrame';
import { FIGMA_TASKS, TasksToolbar } from '../Shell/fixtures';
import { CurrentSidebarWithBar } from './CurrentSidebarWithBar';
import { SidebarFooterBar } from './SidebarFooterBar';

const meta = {
  title: 'Screens/Proposals/Sidebar footer',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function TasksPage() {
  return (
    <>
      <TasksToolbar />
      <PageContent layout="list">
        {FIGMA_TASKS.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </PageContent>
    </>
  );
}

/** The sidebar as it is today, for comparison: the sync line, then Trash, Settings and Help. */
export const Before: Story = {
  render: () => (
    <ScreenFrame page="Tasks" title="Tasks" sync="synced">
      <TasksPage />
    </ScreenFrame>
  ),
};

/** The same sidebar with the footer as one row: sync, then Trash, Settings and Help as icons. */
export const After: Story = {
  render: () => (
    <ScreenFrame title="Tasks" sidebar={<CurrentSidebarWithBar active="Tasks" sync="synced" />}>
      <TasksPage />
    </ScreenFrame>
  ),
};

/** Trash kept as a row (it's a page, and the current item shows there), only Settings and Help as icons. */
export const TrashAsRow: Story = {
  render: () => (
    <ScreenFrame
      title="Tasks"
      sidebar={<CurrentSidebarWithBar active="Tasks" sync="synced" trashRow />}
    >
      <TasksPage />
    </ScreenFrame>
  ),
};

/** On Settings: its icon shows pressed, as the current page. */
export const OnSettings: Story = {
  render: () => (
    <ScreenFrame
      title="Settings"
      sidebar={<CurrentSidebarWithBar active="Settings" sync="error" />}
    >
      <TasksPage />
    </ScreenFrame>
  ),
};

const STATES: (SyncState | undefined)[] = [
  'synced',
  'syncing',
  'error',
  'rate-limited',
  'offline',
  undefined,
];

function Column({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 256 }}>{children}</div>
  );
}

/** Every sync state in the 256px row, and none (no source connected): the buttons stay put. */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 48, padding: 24, background: 'var(--sidebar)' }}>
      <Column>
        {STATES.map((state) => (
          <div key={state ?? 'none'}>
            <div
              style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--subtle-foreground)' }}
            >
              {state ?? 'no sources'}
            </div>
            <Sidebar style={{ height: 'auto', borderRight: 0 }}>
              <SidebarFooter>
                <SidebarFooterBar sync={state} />
              </SidebarFooter>
            </Sidebar>
          </div>
        ))}
      </Column>
    </div>
  ),
};
