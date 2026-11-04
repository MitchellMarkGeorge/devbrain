import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { PRIORITY_LABELS, type Priority } from '../types';
import { PriorityIcon } from './PriorityIcon';

const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];

const meta = {
  title: 'Glyphs/PriorityIcon',
  component: PriorityIcon,
  args: { priority: 'high', size: 16 },
  argTypes: {
    priority: { control: 'inline-radio', options: PRIORITIES },
    size: { control: 'inline-radio', options: [12, 16, 24] },
  },
} satisfies Meta<typeof PriorityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllPriorities: Story = {
  render: () => (
    <Stack gap="3">
      {PRIORITIES.map((priority) => (
        <Flex key={priority} gap="2" align="center">
          <PriorityIcon priority={priority} />
          <Text>{PRIORITY_LABELS[priority]}</Text>
        </Flex>
      ))}
    </Stack>
  ),
};
