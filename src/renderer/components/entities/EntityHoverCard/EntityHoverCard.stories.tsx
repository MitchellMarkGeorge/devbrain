import type { Meta, StoryObj } from '@storybook/react-vite';
import { Clock, Copy, ExternalLink, MapPin, Repeat, Video } from 'lucide-react';
import { Flex } from '../../layout/Flex';
import { Button } from '../../ui/Button';
import { EntityPill } from '../EntityPill';
import { PriorityIcon } from '../PriorityIcon';
import { SourcePill } from '../SourcePill';
import { StatusIcon } from '../StatusIcon';
import { EntityHoverCard, EntityHoverCardContent, EntityHoverCardMeta } from './EntityHoverCard';

const meta = {
  title: 'Entities/EntityHoverCard',
  component: EntityHoverCard,
  parameters: { layout: 'padded' },
  // room below the pill for the open card
  decorators: [
    (Story) => (
      <div style={{ minHeight: 280 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    type: 'project',
    title: 'Website redesign',
    color: 'blue',
    children: <span />,
  },
} satisfies Meta<typeof EntityHoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Point at the pill for 400ms (or focus it) to open the card; clicking still opens the item. */
export const Interactive: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      <EntityHoverCard
        type="project"
        title="Website redesign"
        color="blue"
        pills={
          <>
            <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>
              In progress
            </EntityPill>
            <EntityPill glyph={Clock}>Due Jul 18</EntityPill>
          </>
        }
        progress={{ value: 25, label: '3 of 12 tasks done' }}
      >
        <EntityPill type="project" color="blue">
          Website redesign
        </EntityPill>
      </EntityHoverCard>
      <EntityHoverCard
        type="note"
        title="Onboarding flow notes"
        meta={['Edited 2h ago · Website redesign']}
        preview="Start with the workspace step, then calendars. Skip the integrations screen unless the user signed in with GitHub."
      >
        <EntityPill type="note">Onboarding flow notes</EntityPill>
      </EntityHoverCard>
    </Flex>
  ),
};

export const Project: Story = {
  args: {
    defaultOpen: true,
    type: 'project',
    title: 'Website redesign',
    color: 'blue',
    pills: (
      <>
        <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In progress</EntityPill>
        <EntityPill glyph={Clock}>Due Jul 18</EntityPill>
      </>
    ),
    progress: { value: 25, label: '3 of 12 tasks done' },
    children: (
      <EntityPill type="project" color="blue">
        Website redesign
      </EntityPill>
    ),
  },
};

export const Event: Story = {
  args: {
    defaultOpen: true,
    type: 'event',
    title: 'Mitchell / Jesse 1:1',
    color: 'indigo',
    meta: [
      <EntityHoverCardMeta key="t" icon={Clock}>
        Today, 10:00 – 10:30 AM
      </EntityHoverCardMeta>,
      <EntityHoverCardMeta key="r" icon={Repeat}>
        Every week on Tuesday
      </EntityHoverCardMeta>,
      <EntityHoverCardMeta key="l" icon={MapPin}>
        Room 4B
      </EntityHoverCardMeta>,
    ],
    actions: (
      <Button size="xs" icon={Video}>
        Join
      </Button>
    ),
    children: (
      <EntityPill type="event" color="indigo">
        Mitchell / Jesse 1:1
      </EntityPill>
    ),
  },
};

export const Note: Story = {
  args: {
    defaultOpen: true,
    type: 'note',
    title: 'Onboarding flow notes',
    meta: ['Edited 2h ago · Website redesign'],
    preview:
      'Start with the workspace step, then calendars. Skip the integrations screen unless the user signed in with GitHub, and keep the theme choice for later.',
    children: <EntityPill type="note">Onboarding flow notes</EntityPill>,
  },
};

/** A subtask's parent task */
export const Task: Story = {
  args: {
    defaultOpen: true,
    type: 'task',
    status: 'in-progress',
    title: 'Ship the calendar sync',
    pills: (
      <>
        <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>High</EntityPill>
        <EntityPill glyph={Clock}>Due Jul 1</EntityPill>
        <SourcePill>ENG-118</SourcePill>
      </>
    ),
    progress: { value: 75, label: '3 of 4 subtasks done' },
    children: (
      <EntityPill type="parent" status="in-progress">
        Ship the calendar sync
      </EntityPill>
    ),
  },
};

/** A synced task's key */
export const Source: Story = {
  args: {
    defaultOpen: true,
    type: 'source',
    provider: 'linear',
    title: 'ENG-124 · Fix the token refresh race',
    meta: ['In Review in Linear', 'Synced 3 min ago'],
    actions: (
      <>
        <Button size="xs" icon={ExternalLink}>
          Open in Linear
        </Button>
        <Button size="xs" variant="ghost" icon={Copy}>
          Copy URL
        </Button>
      </>
    ),
    children: <SourcePill>ENG-124</SourcePill>,
  },
};

/** The card's content alone, for static pictures. */
export const ContentOnly: Story = {
  render: () => (
    <div
      style={{
        width: 'fit-content',
        border: '1px solid var(--edge)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--popover)',
      }}
    >
      <EntityHoverCardContent
        type="project"
        title="A project with a name long enough to end in an ellipsis"
        color="green"
        progress={{ value: 60, label: '6 of 10 tasks done' }}
      />
    </div>
  ),
};
