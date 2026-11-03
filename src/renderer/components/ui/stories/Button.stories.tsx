import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Flex } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Controls/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'New Task', icon: 'plus', onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Variants: Story = {
  render: () => (
    <Flex gap={2} wrap="wrap">
      {(
        ['default', 'primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const
      ).map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </Flex>
  ),
};
export const Sizes: Story = {
  render: () => (
    <Flex gap={2}>
      {(['xs', 'sm', 'default', 'lg'] as const).map((size) => (
        <Button key={size} size={size} icon="plus">
          New Task
        </Button>
      ))}
    </Flex>
  ),
};
export const Disabled: Story = { args: { disabled: true } };
export const ToolbarValue: Story = {
  args: {
    icon: 'filter',
    children: 'Filter',
    value: 'Assigned to me',
    title: 'Filter: Assigned to me',
  },
};
