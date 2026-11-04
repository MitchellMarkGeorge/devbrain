import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Kbd, KbdGroup } from './Kbd';

const meta = {
  title: 'Components/Kbd',
  component: Kbd,
  args: { children: '⌘K' },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Keys: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <Kbd>S</Kbd>
      <Kbd>X</Kbd>
      <Kbd>1</Kbd>
      <Kbd>↵</Kbd>
      <Kbd>Esc</Kbd>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>D</Kbd>
      </KbdGroup>
    </Flex>
  ),
};

export const InText: Story = {
  render: () => (
    <Text tone="muted">
      Press <Kbd>⌘K</Kbd> to search tasks, notes and projects.
    </Text>
  ),
};
