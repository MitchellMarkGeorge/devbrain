import type { Meta, StoryObj } from '@storybook/react-vite';
import { SourcePill } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Content/SourcePill',
  component: SourcePill,
  tags: ['autodocs'],
  args: { provider: 'linear', children: 'ENG-124', onClick: fn() },
} satisfies Meta<typeof SourcePill>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const GitHub: Story = { args: { provider: 'github', children: '#124' } };
export const Compact: Story = { args: { compact: true } };
