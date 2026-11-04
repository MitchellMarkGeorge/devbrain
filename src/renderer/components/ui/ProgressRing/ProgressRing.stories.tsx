import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Badge } from '../Badge';
import { ProgressRing } from './ProgressRing';

const meta = {
  title: 'Glyphs/ProgressRing',
  component: ProgressRing,
  args: { value: 3, total: 4, size: 14 },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 12 } },
    total: { control: { type: 'number', min: 0 } },
    size: { control: { type: 'range', min: 12, max: 64 } },
  },
} satisfies Meta<typeof ProgressRing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Subtasks in a row: always with "3/4" */
export const SubtaskCount: Story = {
  render: () => (
    <Flex gap="2">
      <Badge variant="outline" icon={<ProgressRing value={0} total={4} size={12} />}>
        0/4
      </Badge>
      <Badge variant="outline" icon={<ProgressRing value={3} total={4} size={12} />}>
        3/4
      </Badge>
      <Badge variant="outline" icon={<ProgressRing value={4} total={4} size={12} />}>
        4/4
      </Badge>
    </Flex>
  ),
};

/** Project progress on the overview, large and in the health colour */
export const Project: Story = {
  render: () => (
    <Flex gap="3" align="center">
      <ProgressRing value={3} total={12} size={48} stroke={5} color="var(--health-on-track)" />
      <Text tone="muted">25% · 3 of 12 tasks done</Text>
    </Flex>
  ),
};
