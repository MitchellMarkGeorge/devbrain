import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoteCardSkeleton } from '../../ui/Skeleton';
import { NoteCard } from '../../notes/NoteCard';
import { SAMPLE_NOTES, sampleNote } from '../../notes/NoteCard/fixtures';
import { storyAgo } from '../../lib/story-dates';
import { CardGrid } from './CardGrid';

const THOUSAND_NOTES = Array.from({ length: 1000 }, (_, i) => {
  const base = SAMPLE_NOTES[i % SAMPLE_NOTES.length];
  return sampleNote({ ...base, title: `${base.title} #${i + 1}`, updatedAt: storyAgo(30 * i) });
});

const meta = {
  title: 'Shell/CardGrid',
  decorators: [
    (Story) => (
      <div style={{ width: 816 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeColumns: Story = {
  render: () => (
    <CardGrid gap="md">
      {Array.from({ length: 5 }, (_, i) => (
        <NoteCardSkeleton key={i} />
      ))}
    </CardGrid>
  ),
};

/**
 * 1,000 notes, virtualized by rows of cards: only the rows in view are in the DOM, each measured
 * as it draws. Three across (two in compact windows inside an `AppShell`).
 */
export const ThousandCards: Story = {
  name: '1,000 cards',
  decorators: [
    (Story) => (
      <div style={{ width: 960 }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <CardGrid
      gap="md"
      items={THOUSAND_NOTES}
      getKey={(note) => note.title}
      renderItem={(note) => <NoteCard note={note} />}
    />
  ),
};
