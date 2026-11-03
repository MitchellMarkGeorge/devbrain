import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill, NoteCard } from '..';
import { menuItems } from './fixtures';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/NoteCard',
  component: NoteCard,
  tags: ['autodocs'],
  args: {
    title: 'Design system guidelines',
    updated: '2h ago',
    preview:
      'A quiet interface that keeps the work in focus. Every relation is a pill, and every status has a shape.',
    onOpen: fn(),
    menuItems,
  },
} satisfies Meta<typeof NoteCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Linked: Story = {
  args: {
    link: (
      <EntityPill type="project" color="indigo">
        DevBrain
      </EntityPill>
    ),
  },
};
