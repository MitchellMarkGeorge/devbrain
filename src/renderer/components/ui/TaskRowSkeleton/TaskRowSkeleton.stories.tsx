import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskRowSkeleton } from './TaskRowSkeleton';

const meta = {
  title: 'Lists/TaskRowSkeleton',
  component: TaskRowSkeleton,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1152 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskRowSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A loading list: rows stacked with no gap, the title width varied. */
export const Loading: Story = {
  render: () => (
    <div>
      {[240, 180, 300, 210, 260, 150].map((w, i) => (
        <TaskRowSkeleton key={i} titleWidth={w} />
      ))}
    </div>
  ),
};
