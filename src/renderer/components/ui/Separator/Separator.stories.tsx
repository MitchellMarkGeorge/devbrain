import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Separator } from './Separator';

const meta = {
  title: 'UI/Separator',
  component: Separator,
  argTypes: { orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] } },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: (args) => (
    <Stack gap="3" style={{ width: 320 }}>
      <Text tone="strong" weight="medium">
        General
      </Text>
      <Separator {...args} />
      <Text tone="muted">Theme, start of week and time format.</Text>
    </Stack>
  ),
};

export const Vertical: Story = {
  render: () => (
    <Flex gap="3" align="center" style={{ height: 20 }}>
      <Text>Status</Text>
      <Separator orientation="vertical" />
      <Text>Priority</Text>
      <Separator orientation="vertical" />
      <Text>Due date</Text>
    </Flex>
  ),
};
