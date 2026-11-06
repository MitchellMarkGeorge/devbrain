import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { LinkedTaskRow } from './LinkedTaskRow';

const meta = {
  title: 'Lists/LinkedTaskRow',
  component: LinkedTaskRow,
  args: {
    task: {
      title: 'Write PKCE migration guide',
      status: TaskStatus.NOT_STARTED,
      dueDate: storyDate(2),
    },
    onStatusChange: () => {},
    onOpen: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkedTaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Hover: Story = { args: { state: 'hover' } };
export const Focus: Story = { args: { state: 'focus' } };

/** A sheet's Linked tasks: later, due today, overdue (the flag), completed */
export const Panel: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 348 }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div>
      <LinkedTaskRow
        task={{
          title: 'Create user interface mockups',
          status: TaskStatus.NOT_STARTED,
          dueDate: storyDate(8),
        }}
      />
      <LinkedTaskRow
        task={{
          title: 'Write PKCE migration guide',
          status: TaskStatus.NOT_STARTED,
          dueDate: storyDate(0),
        }}
      />
      <LinkedTaskRow
        task={{
          title: 'Audit token storage',
          status: TaskStatus.NOT_STARTED,
          dueDate: storyDate(-3),
        }}
      />
      <LinkedTaskRow
        task={{
          title: 'Generate code verifier',
          status: TaskStatus.COMPLETED,
          dueDate: storyDate(-6),
        }}
      />
    </div>
  ),
};
