import type { Meta, StoryObj } from '@storybook/react-vite';
import { Grid } from '../../layout/Grid';
import { HomeCards } from '../../home/HomeSection';
import { NoteCard } from './NoteCard';
import { SAMPLE_NOTES, sampleNote } from './fixtures';

const meta = {
  title: 'Notes/NoteCard',
  component: NoteCard,
  args: { note: { ...SAMPLE_NOTES[0], project: null } },
} satisfies Meta<typeof NoteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Without a project or link: the preview up to three lines, 144px */
export const Default: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};

/** The Notes card view: ends with the linked event or task, else the project; two lines, 156px */
export const WithLink: Story = {
  decorators: Default.decorators,
  args: { note: SAMPLE_NOTES[0] },
};

/** Home's small card: 86px, one line of title and one of preview, no pill */
export const Small: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 259 }}>
        <Story />
      </div>
    ),
  ],
  args: { size: 'sm', note: SAMPLE_NOTES[0] },
};

/** Home's Recent notes as its first section: three small cards in a `HomeCards` row */
export const HomeRow: Story = {
  render: () => (
    <div style={{ width: 800 }}>
      <HomeCards>
        {SAMPLE_NOTES.map((note) => (
          <NoteCard key={note.title} note={note} size="sm" />
        ))}
      </HomeCards>
    </div>
  ),
};

/** Edited times are Intl's narrow relative times against `now`. */
export const NotesCardView: Story = {
  render: () => (
    <div style={{ maxWidth: 840 }}>
      <Grid minColumnWidth="240px" gap="3">
        {SAMPLE_NOTES.map((note) => (
          <NoteCard key={note.title} note={note} />
        ))}
        <NoteCard note={sampleNote({ title: 'Untitled idea', preview: 'Menu bar quick add?' })} />
      </Grid>
    </div>
  ),
};
