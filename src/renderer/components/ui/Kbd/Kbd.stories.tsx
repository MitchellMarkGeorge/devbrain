import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Kbd, KbdGroup } from './Kbd';

const meta = {
  title: 'UI/Kbd',
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

/** On popovers (the ⌘K search, its footers) the key takes `border-strong`, as `muted` disappears there */
export const Raised: Story = {
  render: () => (
    <div
      style={{
        display: 'inline-flex',
        gap: 8,
        padding: 12,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--popover)',
        boxShadow: '0 0 0 1px var(--edge)',
      }}
    >
      <Kbd variant="raised">Esc</Kbd>
      <Kbd variant="raised">↵</Kbd>
      <Kbd variant="raised">⌘K</Kbd>
    </div>
  ),
};
