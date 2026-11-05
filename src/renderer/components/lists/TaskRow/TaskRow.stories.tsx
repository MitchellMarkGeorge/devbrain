import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { BUSY_TASK, SAMPLE_SUBTASKS, SAMPLE_TASKS } from './fixtures';
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

/** Rest, hover, selected, keyboard focus, completed, overdue and subtask. */
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
      <Label>Subtask</Label>
      <TaskRow task={SAMPLE_SUBTASKS[1]} subtask />
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
      <TaskRow task={SAMPLE_TASKS[3]} />
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
