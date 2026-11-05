import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { TipCard } from './TipCard';

const meta = {
  title: 'Home/First run/TipCard',
  component: TipCard,
  args: { keys: '⌘K', children: 'Search everything' },
  decorators: [
    (Story) => (
      <div style={{ width: 268 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TipCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sequence: Story = {
  render: () => (
    <Stack gap="2">
      <TipCard keys="⌘K">Search everything</TipCard>
      <TipCard keys={['G', 'T']}>Go to Tasks</TipCard>
    </Stack>
  ),
};
