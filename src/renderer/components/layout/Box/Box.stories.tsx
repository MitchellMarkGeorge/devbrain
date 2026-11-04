import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from './Box';

const meta = {
  title: 'Layout/Box',
  component: Box,
  args: { padding: '4', surface: 'card', radius: 'xl', border: 'edge', children: 'A box on the card ground' },
  argTypes: {
    surface: { control: 'inline-radio', options: ['background', 'card', 'muted', 'popover'] },
    radius: { control: 'inline-radio', options: ['md', 'lg', 'xl', 'full'] },
    border: { control: 'inline-radio', options: ['default', 'edge'] },
  },
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
