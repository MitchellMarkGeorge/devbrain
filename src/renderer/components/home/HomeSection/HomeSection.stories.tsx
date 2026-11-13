import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import { NoteCard } from '../../notes/NoteCard';
import { TaskRow } from '../../lists/TaskRow';
import { HomeCards, HomeRows, HomeSection } from './HomeSection';
import {
  sampleEventLink,
  sampleLinear,
  sampleProject,
  sampleTask,
} from '../../lists/TaskRow/fixtures';
import { storyAgo, storyDate } from '../../lib/story-dates';
import { sampleNote } from '../../notes/NoteCard/fixtures';
import { HomeMeetingRow } from '../../home/HomeRow';
import { SAMPLE_MEETINGS } from '../../home/HomeRow/fixtures';

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
      <HomeRows>
        {SAMPLE_MEETINGS.map((meeting, i) => (
          <HomeMeetingRow key={meeting.title} event={meeting} current={i === 0} />
        ))}
      </HomeRows>
    </HomeSection>
  ),
};

/** Tasks are compact `TaskRow`s (44px, no selection strip) with all their pills. */
export const Tasks: Story = {
  render: () => (
    <HomeSection title="Tasks" link="All 6 tasks" more="3 more tasks today">
      <HomeRows>
        <TaskRow
          compact
          task={sampleTask({
            title: 'Refactor token refresh logic',
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.HIGH,
            dueDate: storyDate(-4),
            external: sampleLinear('ENG-131'),
            project: sampleProject('Auth Overhaul', 'blue'),
          })}
        />
        <TaskRow
          compact
          task={sampleTask({
            title: 'Implement OAuth2 PKCE flow',
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.HIGH,
            dueDate: storyDate(0),
            external: sampleLinear('ENG-124'),
            subtaskProgress: { completed: 3, total: 4 },
            project: sampleProject('Auth Overhaul', 'blue'),
            link: sampleEventLink('Mitchell / Jesse 1:1', 'green'),
          })}
        />
      </HomeRows>
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
          note={sampleNote({
            title: 'PKCE design notes',
            updatedAt: storyAgo(60 * 24),
            preview:
              'S256 challenge, 96-char verifier and a 10-minute code TTL, behind a feature flag.',
          })}
        />
        <NoteCard
          size="sm"
          note={sampleNote({
            title: 'Sprint 15 planning',
            updatedAt: storyAgo(60 * 24),
            preview: 'Ship PKCE behind a flag, finish the token audit, start the rate-limit spike.',
          })}
        />
        <NoteCard
          size="sm"
          note={sampleNote({
            title: 'Architecture ADR #4 — PKCE',
            updatedAt: storyAgo(60 * 24 * 3),
            preview: 'Adopt PKCE for every public client and retire the implicit flow.',
          })}
        />
      </HomeCards>
    </HomeSection>
  ),
};
