import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { LinkState, TaskPriority, TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { BUSY_TASK, SAMPLE_SUBTASKS, SAMPLE_TASKS, sampleLinear, sampleTask } from './fixtures';
import { TaskRow } from './TaskRow';

const meta = {
  title: 'Lists/TaskRow',
  component: TaskRow,
  args: { task: SAMPLE_TASKS[0] },
  argTypes: {
    state: { control: 'inline-radio', options: [undefined, 'hover', 'focus'] },
    selected: { control: 'boolean' },
    showProject: { control: 'boolean' },
    showParent: { control: 'boolean' },
    showLink: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 880 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const Label = ({ children }: { children: string }) => (
  <Text size="xs" tone="subtle" style={{ padding: '12px 0 4px 32px' }}>
    {children}
  </Text>
);

/**
 * Rest, hover, selected, keyboard focus, completed, overdue, synced and subtask. Overdue is worked
 * out from the status and due date: the task keeps its status icon, with its date in red. A synced
 * task's status is its provider's: the icon is not a button (pointing at it shows no tint) and opens
 * no menu. A detached task is a local copy, and its icon opens the menu again.
 */
export const States: Story = {
  render: () => (
    <Stack>
      <Label>Rest</Label>
      <TaskRow task={SAMPLE_TASKS[2]} />
      <Label>Hover</Label>
      <TaskRow task={SAMPLE_TASKS[0]} state="hover" />
      <Label>Selected</Label>
      <TaskRow task={SAMPLE_TASKS[3]} selected />
      <Label>Keyboard focus</Label>
      <TaskRow task={SAMPLE_TASKS[0]} state="focus" />
      <Label>Completed</Label>
      <TaskRow task={SAMPLE_TASKS[4]} />
      <Label>Overdue</Label>
      <TaskRow task={SAMPLE_TASKS[1]} />
      <Label>Overdue, in progress</Label>
      <TaskRow
        task={sampleTask({
          title: 'Review the sync retry backoff',
          status: TaskStatus.IN_PROGRESS,
          dueDate: storyDate(-1),
        })}
      />
      <Label>Cancelled</Label>
      <TaskRow
        task={sampleTask({
          title: 'Prototype a menu bar app',
          status: TaskStatus.CANCELLED,
          dueDate: storyDate(-5),
        })}
      />
      <Label>Synced: no status menu</Label>
      <TaskRow
        task={sampleTask({
          title: 'Rotate the webhook signing secret',
          status: TaskStatus.IN_PROGRESS,
          external: sampleLinear('ENG-150'),
          dueDate: storyDate(3),
        })}
      />
      <Label>Detached: a local copy, with its menu</Label>
      <TaskRow
        task={sampleTask({
          title: 'Move the cron jobs to the queue',
          status: TaskStatus.NOT_STARTED,
          external: { ...sampleLinear('ENG-151'), state: LinkState.DETACHED },
          dueDate: storyDate(4),
        })}
      />
      <Label>Subtask, drawn under its parent (TaskList nested)</Label>
      <TaskRow task={SAMPLE_SUBTASKS[1]} tree={{ depth: 1, cells: ['elbow'], open: false }} />
    </Stack>
  ),
};

const UNDATED = sampleTask({ title: 'Write the release notes', priority: TaskPriority.MEDIUM });

/**
 * A task without a due date: its date slot reads "No date" at rest, and shows "Set due date" in its
 * place (a quiet calendar-plus opening the date picker) while the row is pointed at or focused. A
 * closed or synced task, or a row the page gives no `onDueDateChange`, keeps "No date".
 */
export const NoDueDate: Story = {
  name: 'No due date',
  render: () => (
    <Stack>
      <Label>Rest</Label>
      <TaskRow task={UNDATED} onDueDateChange={() => {}} />
      <Label>Hover: Set due date</Label>
      <TaskRow task={UNDATED} state="hover" onDueDateChange={() => {}} />
      <Label>Completed: nothing to set, keeps No date</Label>
      <TaskRow
        task={{ ...UNDATED, status: TaskStatus.COMPLETED }}
        state="hover"
        onDueDateChange={() => {}}
      />
    </Stack>
  ),
};

/** On a project's page, where every task is that project's, the row leaves its project pill off. */
export const WithoutProject: Story = {
  name: 'Without project pill',
  args: { showProject: false },
};

export const StatusMenuOpen: Story = {
  args: { defaultMenuOpen: true },
  decorators: [
    (Story) => (
      <div style={{ paddingBottom: 140 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Given `onPriorityChange`, the priority icon is a button that opens the `PriorityMenu` (High,
 * Medium, Low, ⇧1–⇧3); a synced task's, or a row's without it, is the icon alone.
 */
export const PriorityMenuOpen: Story = {
  args: { defaultPriorityMenuOpen: true, onPriorityChange: () => {} },
  decorators: [
    (Story) => (
      <div style={{ paddingBottom: 140 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * With no pills on its side (a subtask's row), the priority is the side's first part. Open, its
 * button stays where it was: against the date.
 */
export const PriorityMenuOpenWithoutPills: Story = {
  name: 'Priority menu open, no side pills',
  args: {
    task: sampleTask({ title: 'Write the migration', priority: TaskPriority.LOW }),
    showProject: false,
    showLink: false,
    defaultPriorityMenuOpen: true,
    onPriorityChange: () => {},
  },
  decorators: PriorityMenuOpen.decorators,
};

/**
 * A row short of room: the pills give way first. They stack, each sliding under the one after it
 * down to its icon; then the last pill of each group shortens its label; only then does the title
 * shorten, and never below 48px. Point at a group of pills to spread that group back out: the pills
 * slide apart as the title draws back.
 */
export const NarrowRows: Story = {
  name: 'Narrow rows',
  decorators: [
    (Story) => (
      <div style={{ width: 1120 }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <Stack gap="2">
      {[1120, 900, 760, 640, 520, 420].map((width) => (
        <div key={width} style={{ width }}>
          <Label>{`${width}px`}</Label>
          <TaskRow task={BUSY_TASK} />
        </div>
      ))}
    </Stack>
  ),
};

/** Drag the handle at the bottom right to resize the rows and watch the pills stack; point at a group to spread it. */
export const Resizable: Story = {
  render: () => (
    <div
      style={{
        width: 760,
        minWidth: 360,
        maxWidth: 1200,
        resize: 'horizontal',
        overflow: 'hidden',
        paddingBottom: 12,
        borderBottom: '1px dashed var(--border)',
      }}
    >
      <TaskRow task={BUSY_TASK} />
      <TaskRow task={SAMPLE_TASKS[0]} />
    </div>
  ),
};

export const Synced: Story = {
  render: () => (
    <Stack>
      <TaskRow task={SAMPLE_TASKS[0]} />
      <TaskRow task={SAMPLE_TASKS[4]} />
    </Stack>
  ),
};

/**
 * Due dates as `useFormat()` words them against `now` (22 Jun 2026 in Storybook): luxon's relative
 * day within a week, else the short date.
 */
export const DueDates: Story = {
  render: () => (
    <Stack>
      {[-8, -1, 0, 1, 3, 6, 9].map((days) => (
        <TaskRow
          key={days}
          task={sampleTask({ title: `Due ${days} days from today`, dueDate: storyDate(days) })}
        />
      ))}
    </Stack>
  ),
};

/** Home's tasks: 44px with no selection strip, the status icon 12px in. */
export const Compact: Story = {
  args: { compact: true, onSelect: undefined },
  decorators: [
    (Story) => (
      <div style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
};
