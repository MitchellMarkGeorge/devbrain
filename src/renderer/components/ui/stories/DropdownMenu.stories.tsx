import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, DropdownMenu } from '..';
import { menuItems } from './fixtures';

const meta = {
  title: 'Overlays/DropdownMenu',
  component: DropdownMenu,
  tags: ['autodocs'],
  args: { items: menuItems, trigger: <Button trailingIcon="chevron-down">Task Actions</Button> },
} satisfies Meta<typeof DropdownMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
