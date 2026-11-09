import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoteCard } from '../../notes/NoteCard';
import { SAMPLE_NOTES, sampleNote } from '../../notes/NoteCard/fixtures';
import { storyAgo } from '../../lib/story-dates';
import { VirtualCardGrid } from './VirtualCardGrid';

const THOUSAND_NOTES = Array.from({ length: 1000 }, (_, i) => {
  const base = SAMPLE_NOTES[i % SAMPLE_NOTES.length];
  return sampleNote({ ...base, title: `${base.title} #${i + 1}`, updatedAt: storyAgo(30 * i) });
});

const meta = {
  title: 'Shell/VirtualCardGrid',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 1,000 notes, virtualized by rows of cards: the grid fills the 600px it is given and scrolls on
 * its own, with only the rows in view in the DOM, each measured as it draws. Three across (two in
 * compact windows inside a `WorkspaceShell`).
 */
export const ThousandCards: Story = {
  name: '1,000 cards',
  decorators: [
    (Story) => (
      <div style={{ width: 960, height: 600, display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <VirtualCardGrid
      gap="md"
      items={THOUSAND_NOTES}
      getKey={(note) => note.title}
      renderItem={(note) => <NoteCard note={note} />}
      aria-label="Notes"
    />
  ),
};
