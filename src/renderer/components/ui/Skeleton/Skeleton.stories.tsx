import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Skeleton } from './Skeleton';

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
  args: { width: 240, height: 16, shape: 'block' },
  argTypes: { shape: { control: 'inline-radio', options: ['block', 'circle', 'card'] } },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A loading task row: status, title and pills */
export const Row: Story = {
  render: () => (
    <Stack gap="0" style={{ width: 560 }}>
      {[260, 200, 320].map((w) => (
        <Flex
          key={w}
          align="center"
          gap="3"
          style={{ height: 'var(--row-height)', padding: '0 8px' }}
        >
          <Skeleton shape="circle" width={16} height={16} />
          <Skeleton width={w} height={14} />
          <Flex gap="2" style={{ marginLeft: 'auto' }}>
            <Skeleton width={80} height={24} shape="circle" />
            <Skeleton width={48} height={14} />
          </Flex>
        </Flex>
      ))}
    </Stack>
  ),
};

/** A card skeleton keeps the card's fill and outline */
export const CardShape: Story = {
  render: () => (
    <Skeleton shape="card" width={260} height={144} render={<div />}>
      <Stack gap="2" style={{ padding: 16 }}>
        <Skeleton width={120} height={14} />
        <Skeleton width="100%" height={12} />
        <Skeleton width="80%" height={12} />
      </Stack>
    </Skeleton>
  ),
};
