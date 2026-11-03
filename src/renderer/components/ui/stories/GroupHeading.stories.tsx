import type { Meta, StoryObj } from '@storybook/react-vite';
import { GroupHeading } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/GroupHeading',
  component: GroupHeading,
  tags: ['autodocs'],
  args: {
    label: 'DevBrain',
    subtitle: 'Project · Due Nov 12',
    icon: 'folder',
    iconColor: 'indigo',
    done: 3,
    total: 12,
    onToggle: fn(),
    onAdd: fn(),
  },
} satisfies Meta<typeof GroupHeading>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
