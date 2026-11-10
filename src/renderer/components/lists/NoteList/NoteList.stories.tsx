import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NoteId } from '@common/ids';
import { storyAgo } from '../../lib/story-dates';
import { PKCE_NOTE, SAMPLE_NOTES } from '../../notes/NoteCard/fixtures';
import { NoteList, type NoteListRow } from './NoteList';

const NOTES: NoteListRow[] = [PKCE_NOTE, ...SAMPLE_NOTES].map((note, i) => ({
  ...note,
  id: `nte_${i}` as NoteId,
}));

// a long workspace: only the rows in view are drawn
const MANY: NoteListRow[] = Array.from({ length: 1000 }, (_, i) => ({
  ...NOTES[i % NOTES.length],
  id: `nte_many_${i}` as NoteId,
  title: `${NOTES[i % NOTES.length].title} (${i + 1})`,
  updatedAt: storyAgo(30 * (i + 1)),
}));

const meta = {
  title: 'Lists/NoteList',
  component: NoteList,
  args: { notes: NOTES, onOpen: () => {} },
  decorators: [
    (Story) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: 480, maxWidth: 1152 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NoteList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Notes list view (Figma `7158:11693`): a row per note, newest edit first. */
export const Default: Story = {};

/** 1,000 notes: about 30 rows are drawn, and the scrollbar is the whole list's. */
export const Long: Story = { args: { notes: MANY } };
