import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { TaskPriority, TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { BUSY_TASK, SAMPLE_SUBTASKS, SAMPLE_TASKS, sampleTask } from './fixtures';
import { TaskRow } from './TaskRow';

const meta = {
  title: 'Lists/TaskRow',
  component: TaskRow,
  args: { task: SAMPLE_TASKS[0] },
  argTypes: {
    state: { control: 'inline-radio', options: [undefined, 'hover', 'focus'] },
    stack: { control: 'inline-radio', options: ['auto', 'none', 'right', 'both'] },
    selected: { control: 'boolean' },
    subtask: { control: 'boolean' },
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
  <Text size="xs" tone="subtle" style={{ padding: '12px 0 4px 36px' }}>
    {children}
  </Text>
);

/**
 * Rest, hover, selected, keyboard focus, completed, overdue and subtask. Overdue is worked out
 * from the status and due date: a task not started shows the flag; one in progress keeps its icon,
 * with its date in red.
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
      <Label>Subtask</Label>
      <TaskRow task={SAMPLE_SUBTASKS[1]} subtask />
    </Stack>
  ),
};

const UNDATED = sampleTask({ title: 'Write the release notes', priority: TaskPriority.MEDIUM });

/**
 * A task without a due date: its date slot is blank at rest, and shows "Set due date" (a quiet
 * calendar-plus opening the date picker) while the row is pointed at or focused. A closed or
 * synced task, or a row the page gives no `onDueDateChange`, stays blank.
 */
export const NoDueDate: Story = {
  name: 'No due date',
  render: () => (
    <Stack>
      <Label>Rest</Label>
      <TaskRow task={UNDATED} onDueDateChange={() => {}} />
      <Label>Hover: Set due date</Label>
      <TaskRow task={UNDATED} state="hover" onDueDateChange={() => {}} />
      <Label>Completed: nothing to set</Label>
      <TaskRow
        task={{ ...UNDATED, status: TaskStatus.COMPLETED }}
        state="hover"
        onDueDateChange={() => {}}
      />
    </Stack>
  ),
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
 * The row stacks its own pills as it narrows (`stack="auto"`, the default): first the pills after
 * the title, then the key with the parent and subtask pills; the title shortens only after that.
 * Point at a stack to spread it out over the end of the title.
 */
export const StackedPills: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 1120 }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <Stack gap="2">
      {[1120, 900, 760, 640].map((width) => (
        <div key={width} style={{ width }}>
          <Label>{`${width}px`}</Label>
          <TaskRow task={BUSY_TASK} />
        </div>
      ))}
    </Stack>
  ),
};

/** Drag the handle at the bottom right to resize the row and watch the pills stack and spread. */
export const Resizable: Story = {
  render: () => (
    <div
      style={{
        width: 760,
        minWidth: 420,
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

/** Each level pinned, for pictures of the row */
export const PinnedLevels: Story = {
  render: () => (
    <div style={{ width: 760 }}>
      <Stack gap="2">
        <Label>Pinned right</Label>
        <TaskRow task={BUSY_TASK} stack="right" />
        <Label>Pinned both</Label>
        <TaskRow task={BUSY_TASK} stack="both" />
      </Stack>
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
