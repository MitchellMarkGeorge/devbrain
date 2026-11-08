import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill } from '../../entities/EntityPill';
import { SourcePill } from '../../entities/SourcePill';
import { TaskStatus } from '@common/types';
import { storyAgo } from '../../lib/story-dates';
import { TrashRow } from './TrashRow';

const meta = {
  title: 'Lists/TrashRow',
  component: TrashRow,
  args: {
    item: {
      entityType: 'notes',
      title: 'Sprint 14 retro',
      preview: 'What went well, what to change and action items for sprint 15.',
      archivedAt: storyAgo(60 * 24 * 3),
    },
    onSelect: () => {},
    onRestore: () => {},
    onDelete: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1152 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrashRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Pointed at: Restore and Delete show after the trashed time. */
export const Hover: Story = { args: { state: 'hover' } };

export const Kinds: Story = {
  render: () => (
    <div>
      <TrashRow
        item={{
          entityType: 'projects',
          title: 'AI Action Items',
          color: 'green',
          archivedAt: storyAgo(60 * 24),
        }}
      />
      <TrashRow
        item={{
          entityType: 'tasks',
          title: 'Set up API Gateway',
          status: TaskStatus.COMPLETED,
          archivedAt: storyAgo(60 * 24 * 5),
        }}
        titlePills={<SourcePill>ENG-102</SourcePill>}
      >
        <EntityPill entity={{ type: 'project', title: 'API Gateway v2', color: 'amber' }} />
      </TrashRow>
      <TrashRow
        item={{
          entityType: 'notes',
          title: 'Mitchell / Jesse 1:1 notes',
          preview: 'Agenda, follow-ups and decisions from the weekly 1:1.',
          archivedAt: storyAgo(60 * 24 * 8),
        }}
      />
    </div>
  ),
};
