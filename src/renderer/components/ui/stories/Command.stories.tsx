import type { Meta, StoryObj } from '@storybook/react-vite';
import { Command } from '..';
import { commandGroups } from './fixtures';
import { fn } from 'storybook/test';

const meta = {
  title: 'Overlays/Command',
  component: Command,
  tags: ['autodocs'],
  args: { groups: commandGroups, placeholder: 'Search commands…', onSelect: fn() },
} satisfies Meta<typeof Command>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
