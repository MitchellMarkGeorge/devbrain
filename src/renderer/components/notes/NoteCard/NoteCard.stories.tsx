import type { Meta, StoryObj } from '@storybook/react-vite';
import { Grid } from '../../layout/Grid';
import { EntityPill } from '../../entities/EntityPill';
import { HomeCards } from '../../home/HomeSection';
import { NoteCard } from './NoteCard';

const notes = [
  {
    title: 'Q4 planning notes',
    updated: '2h ago',
    preview:
      'Settle the calendar sync scope, agree who owns the onboarding rewrite, and decide whether the board ships in 1.0 or waits for the list behaviours to land first.',
  },
  {
    title: 'Mitchell / Jesse 1:1',
    updated: 'Yesterday',
    preview: 'Talked through the release plan and the open hiring loop.',
  },
  {
    title: 'Sync engine design',
    updated: 'Sep 24',
    preview:
      'Every provider writes through one change log, so a task edited offline replays in order once the network is back. Conflicts favour the most recent edit at the field level.',
  },
];

const meta = {
  title: 'Notes/NoteCard',
  component: NoteCard,
  args: notes[0],
} satisfies Meta<typeof NoteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Without a link: the preview up to three lines, 144px */
export const Default: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};

/** The Notes card view: ends with the project or event pill; two lines, 156px */
export const WithLink: Story = {
  decorators: Default.decorators,
  args: {
    link: (
      <EntityPill type="project" color="amber">
        Planning
      </EntityPill>
    ),
  },
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
  args: { size: 'sm' },
};

/** Home's Recent notes as its first section: three small cards in a `HomeCards` row */
export const HomeRow: Story = {
  render: () => (
    <div style={{ width: 800 }}>
      <HomeCards>
        {notes.map((n) => (
          <NoteCard key={n.title} {...n} size="sm" />
        ))}
      </HomeCards>
    </div>
  ),
};

export const NotesCardView: Story = {
  render: () => (
    <div style={{ maxWidth: 840 }}>
      <Grid minColumnWidth="240px" gap="3">
        <NoteCard
          {...notes[0]}
          link={
            <EntityPill type="project" color="amber">
              Planning
            </EntityPill>
          }
        />
        <NoteCard
          {...notes[1]}
          link={
            <EntityPill type="event" color="indigo">
              Mitchell / Jesse 1:1
            </EntityPill>
          }
        />
        <NoteCard
          {...notes[2]}
          link={
            <EntityPill type="project" color="blue">
              DevBrain 1.0
            </EntityPill>
          }
        />
      </Grid>
    </div>
  ),
};
