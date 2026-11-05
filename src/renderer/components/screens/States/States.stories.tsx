import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, CircleCheck, LayoutGrid, List, ListFilter, Plus } from 'lucide-react';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { CardGrid } from '../../shell/CardGrid';
import { EmptyState } from '../../ui/EmptyState';
import { PageContent, PageHeader, PageToolbar } from '../../shell/PageHeader';
import { NoteCardSkeleton, Skeleton } from '../../ui/Skeleton';
import { TaskRow } from '../../lists/TaskRow';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { ScreenFrame } from '../Shell/AppFrame';
import { FIGMA_TASKS, TasksHeader, TasksToolbar } from '../Shell/fixtures';

const meta = {
  title: 'Screens/States/States',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma "Tasks (list) — empty" (7175:35659): the empty state 160px under the toolbar. */
export const TasksEmpty: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />}>
      <TasksToolbar />
      <PageContent layout="list">
        <EmptyState
          icon={CircleCheck}
          title="No tasks yet"
          description="Tasks you add, and Linear issues assigned to you, show up here."
          action={
            <Button size="sm" icon={Plus}>
              New Task
            </Button>
          }
        />
      </PageContent>
    </ScreenFrame>
  ),
};

/** Figma "Notes (cards) — loading" (7175:36096): six card skeletons; the count's place pulses in the toolbar. */
export const NotesLoading: Story = {
  render: () => (
    <ScreenFrame
      page="Notes"
      header={
        <PageHeader>
          <Breadcrumb items={['Notes', { label: 'Cards', icon: LayoutGrid }]} />
        </PageHeader>
      }
    >
      <PageToolbar
        start={
          <Button icon={ListFilter} value="All">
            Filter
          </Button>
        }
        end={
          <>
            <Skeleton shape="circle" width={44} height={12} />
            <Button icon={ArrowUpDown} value="Last edited">
              Sort
            </Button>
            <ToggleGroup
              aria-label="View"
              defaultValue="cards"
              items={[
                { value: 'list', icon: List },
                { value: 'cards', icon: LayoutGrid },
              ]}
            />
            <Button icon={Plus}>New Note</Button>
          </>
        }
      />
      <PageContent layout="grid" aria-busy>
        <CardGrid gap="md">
          {Array.from({ length: 6 }, (_, i) => (
            <NoteCardSkeleton key={i} />
          ))}
        </CardGrid>
      </PageContent>
    </ScreenFrame>
  ),
};

/** Figma "Tasks (list) — sync failed" (7175:37244): the sync line at the top of the sidebar's footer. */
export const SyncFailed: Story = {
  render: () => (
    <ScreenFrame page="Tasks" header={<TasksHeader />} sync="error">
      <TasksToolbar />
      <PageContent layout="list">
        {FIGMA_TASKS.filter((t) => t.id !== 'mobile').map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </PageContent>
    </ScreenFrame>
  ),
};
