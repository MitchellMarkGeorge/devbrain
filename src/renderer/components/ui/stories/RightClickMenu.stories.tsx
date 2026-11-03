import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, RightClickMenu } from '..';
import { menuItems } from './fixtures';

const meta = {
  title: 'Overlays/RightClickMenu',
  component: RightClickMenu,
  tags: ['autodocs'],
  args: {
    items: menuItems,
    children: <Card title="Context menu">Right-click this card for task actions.</Card>,
  },
} satisfies Meta<typeof RightClickMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
