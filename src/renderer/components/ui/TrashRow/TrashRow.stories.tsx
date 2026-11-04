import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill } from '../EntityPill';
import { SourcePill } from '../SourcePill';
import { TrashRow } from './TrashRow';

const meta = {
  title: 'Lists/TrashRow',
  component: TrashRow,
  args: {
    item: {
      kind: 'note',
      title: 'Sprint 14 retro',
      excerpt: 'What went well, what to change and action items for sprint 15.',
      trashed: 'Trashed 3d ago',
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
          kind: 'project',
          title: 'AI Action Items',
          color: 'green',
          trashed: 'Trashed 1d ago',
        }}
      />
      <TrashRow
        item={{
          kind: 'task',
          title: 'Set up API Gateway',
          status: 'completed',
          trashed: 'Trashed 5d ago',
        }}
        titlePills={<SourcePill>ENG-102</SourcePill>}
      >
        <EntityPill type="project" color="amber">
          API Gateway v2
        </EntityPill>
      </TrashRow>
      <TrashRow
        item={{
          kind: 'note',
          title: 'Mitchell / Jesse 1:1 notes',
          excerpt: 'Agenda, follow-ups and decisions from the weekly 1:1.',
          trashed: 'Trashed 1w ago',
        }}
      />
    </div>
  ),
};
