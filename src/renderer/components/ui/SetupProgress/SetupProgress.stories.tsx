import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { SetupProgress } from './SetupProgress';

const meta = {
  title: 'Home/First run/SetupProgress',
  component: SetupProgress,
  args: { done: 2 },
} satisfies Meta<typeof SetupProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Steps: Story = {
  render: () => (
    <Stack gap="3" align="start">
      {[0, 1, 2, 3].map((done) => (
        <SetupProgress key={done} done={done} />
      ))}
    </Stack>
  ),
};
