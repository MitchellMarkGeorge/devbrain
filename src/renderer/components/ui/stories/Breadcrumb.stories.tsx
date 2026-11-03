import type { Meta, StoryObj } from '@storybook/react-vite';
import { Breadcrumb } from '..';

const meta = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  tags: ['autodocs'],
  args: {
    items: [
      { label: 'Projects', href: '#projects' },
      { label: 'DevBrain', href: '#devbrain' },
      'Design system',
    ],
    icon: 'file-text',
  },
} satisfies Meta<typeof Breadcrumb>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
