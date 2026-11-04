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
    stack: { control: 'inline-radio', options: [undefined, 'right', 'both'] },
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
 * When the row runs out of room the pills stack like a deck; pointing at a stack spreads it out
 * over the end of the title.
 */
export const StackedPills: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 960 }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <Stack gap="2">
      <Label>Spread (room for every pill)</Label>
      <TaskRow task={{ ...BUSY_TASK, title: 'Move sync onto listeners' }} />
      <div style={{ width: 760 }}>
        <Label>Stacked right (760px)</Label>
        <TaskRow task={BUSY_TASK} stack="right" />
        <Label>Stacked both (760px)</Label>
        <TaskRow task={BUSY_TASK} stack="both" />
      </div>
    </Stack>
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
