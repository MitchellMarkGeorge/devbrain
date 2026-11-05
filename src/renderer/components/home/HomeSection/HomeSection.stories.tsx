import type { Meta, StoryObj } from '@storybook/react-vite';
import { Video } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ColourBar } from '../../ui/ColourBar';
import { HomeRow } from '../HomeRow';
import { NoteCard } from '../../notes/NoteCard';
import { TaskRow } from '../../lists/TaskRow';
import { HomeCards, HomeSection } from './HomeSection';

const meta = {
  title: 'Home/HomeSection',
  component: HomeSection,
  args: { title: 'Meetings', link: 'Calendar', more: '1 more meeting today', children: null },
  decorators: [
    (Story) => (
      <div style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three meeting `HomeRow`s and the line for the rest. */
export const Meetings: Story = {
  render: (args) => (
    <HomeSection {...args}>
      <HomeRow
        current
        icon={<ColourBar color="green" />}
        title="Sprint Planning"
        meta="In 12 min"
        metaTone="today"
      >
        <Button size="xs" icon={Video}>
          Join
        </Button>
      </HomeRow>
      <HomeRow icon={<ColourBar color="green" />} title="Mitchell / Jesse 1:1" meta="10:30" />
      <HomeRow icon={<ColourBar color="blue" />} title="Design Review" meta="1:00" />
    </HomeSection>
  ),
};

/** Tasks are compact `TaskRow`s (44px, no selection strip) with all their pills. */
export const Tasks: Story = {
  render: () => (
    <HomeSection title="Tasks" link="All 6 tasks" more="3 more tasks today">
      <TaskRow
        compact
        task={{
          title: 'Refactor token refresh logic',
          status: 'in-progress',
          key: 'ENG-131',
          project: 'Auth Overhaul',
          projectColor: 'blue',
          priority: 'high',
          date: 'Jun 18',
          dateTone: 'overdue',
        }}
      />
      <TaskRow
        compact
        task={{
          title: 'Implement OAuth2 PKCE flow',
          status: 'in-progress',
          key: 'ENG-124',
          subtasks: [3, 4],
          event: 'Mitchell / Jesse 1:1',
          eventColor: 'green',
          project: 'Auth Overhaul',
          projectColor: 'blue',
          priority: 'high',
          date: 'Today',
          dateTone: 'today',
        }}
      />
    </HomeSection>
  ),
};

/** Recent notes as the first section: small cards three across. */
export const Cards: Story = {
  render: () => (
    <HomeSection title="Recent notes" link="All notes">
      <HomeCards>
        <NoteCard
          size="sm"
          title="PKCE design notes"
          updated="Yesterday"
          preview="S256 challenge, 96-char verifier and a 10-minute code TTL, behind a feature flag."
        />
        <NoteCard
          size="sm"
          title="Sprint 15 planning"
          updated="Yesterday"
          preview="Ship PKCE behind a flag, finish the token audit, start the rate-limit spike."
        />
        <NoteCard
          size="sm"
          title="Architecture ADR #4 — PKCE"
          updated="Jun 19"
          preview="Adopt PKCE for every public client and retire the implicit flow."
        />
      </HomeCards>
    </HomeSection>
  ),
};
