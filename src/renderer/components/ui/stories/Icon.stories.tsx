import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon } from '..';

const meta = {
  title: 'Foundations/Icon',
  component: Icon,
  tags: ['autodocs'],
  args: { name: 'folder', label: 'Project' },
} satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
