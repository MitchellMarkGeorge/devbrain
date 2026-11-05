import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { Progress } from './Progress';

const meta = {
  title: 'UI/Progress',
  component: Progress,
  args: { value: 25 },
  argTypes: { value: { control: { type: 'range', min: 0, max: 100 } } },
  decorators: [(Story) => <div style={{ width: 240 }}>{Story()}</div>],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { value: 25, label: '3 of 12 tasks done', showValue: true },
};

export const Values: Story = {
  render: () => (
    <Stack gap="4">
      <Progress value={0} aria-label="No tasks done" />
      <Progress value={50} aria-label="Half done" />
      <Progress value={100} aria-label="All done" />
    </Stack>
  ),
};
