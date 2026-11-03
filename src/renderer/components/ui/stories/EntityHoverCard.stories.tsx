import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityHoverCard, EntityPill } from '..';

const meta = {
  title: 'Overlays/EntityHoverCard',
  component: EntityHoverCard,
  tags: ['autodocs'],
  args: {
    type: 'project',
    title: 'DevBrain',
    color: 'indigo',
    trigger: (
      <EntityPill type="project" color="indigo">
        DevBrain
      </EntityPill>
    ),
    meta: ['Due Nov 12'],
    progress: { value: 25, label: '3 of 12 tasks done' },
  },
} satisfies Meta<typeof EntityHoverCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
