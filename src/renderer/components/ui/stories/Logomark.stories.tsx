import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logomark } from '..';

const meta = {
  title: 'Foundations/Logomark',
  component: Logomark,
  tags: ['autodocs'],
  args: { lockup: true, size: 40 },
} satisfies Meta<typeof Logomark>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
