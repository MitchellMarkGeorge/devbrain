import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinkedTaskRow } from './LinkedTaskRow';

const meta = {
  title: 'Lists/LinkedTaskRow',
  component: LinkedTaskRow,
  args: {
    title: 'Write PKCE migration guide',
    status: 'not-started',
    date: 'Jun 24',
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

/** A sheet's Linked tasks: due today, overdue (the flag), completed */
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
      <LinkedTaskRow title="Create user interface mockups" status="not-started" date="Jun 30" />
      <LinkedTaskRow
        title="Write PKCE migration guide"
        status="not-started"
        date="Today"
        dateTone="today"
      />
      <LinkedTaskRow
        title="Audit token storage"
        status="overdue"
        date="Jun 19"
        dateTone="overdue"
      />
      <LinkedTaskRow title="Generate code verifier" status="completed" date="Jun 16" />
    </div>
  ),
};
