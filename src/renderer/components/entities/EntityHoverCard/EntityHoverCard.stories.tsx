import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, ExternalLink, Video } from 'lucide-react';
import {
  LinkState,
  ProjectStatus,
  Provider,
  TaskPriority,
  TaskStatus,
  type ExternalRef,
} from '@common/types';
import { Flex } from '../../layout/Flex';
import { storyAgo, storyDate } from '../../lib/story-dates';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ProgressRing } from '../../ui/ProgressRing';
import type { TaskId } from '@common/ids';
import { EntityPill } from '../EntityPill';
import { SourcePill } from '../SourcePill';
import { TaskRow } from '../../lists/TaskRow';
import { BUSY_TASK } from '../../lists/TaskRow/fixtures';
import { EntityHoverCard, EntityHoverCardContent, type HoverCardEntity } from './EntityHoverCard';
import {
  EntityHoverCardPlaceholder,
  PillHoverCardsProvider,
  type PillTarget,
} from './PillHoverCards';

const PROJECT = {
  type: 'project',
  title: 'Website redesign',
  color: 'blue',
  status: ProjectStatus.ACTIVE,
  dueDate: storyDate(26),
  stats: { numOfCompleted: 3, totalTasks: 12 },
} satisfies HoverCardEntity;

const NOTE = {
  type: 'note',
  title: 'Onboarding flow notes',
  updatedAt: storyAgo(120),
  project: { title: 'Website redesign' },
  preview:
    'Start with the workspace step, then calendars. Skip the integrations screen unless the user signed in with GitHub, and keep the theme choice for later.',
} satisfies HoverCardEntity;

const EVENT = {
  type: 'event',
  title: 'Mitchell / Jesse 1:1',
  color: 'indigo',
  startAt: storyDate(0, 10),
  endAt: storyDate(0, 10, 30),
  allDay: false,
  recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
  location: 'Room 4B',
} satisfies HoverCardEntity;

const LINEAR: ExternalRef = {
  provider: Provider.LINEAR,
  state: LinkState.SYNCED,
  key: 'ENG-124',
  url: 'https://linear.app/devbrain/issue/ENG-124',
  statusLabel: 'In Review',
  priorityLabel: null,
  lastSyncedAt: storyAgo(3),
};

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
  args: { entity: PROJECT, children: <span /> },
} satisfies Meta<typeof EntityHoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Point at the pill for 400ms (or focus it) to open the card; clicking still opens the item. */
export const Interactive: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      <EntityHoverCard entity={PROJECT}>
        <EntityPill entity={PROJECT} />
      </EntityHoverCard>
      <EntityHoverCard entity={NOTE}>
        <EntityPill entity={NOTE} />
      </EntityHoverCard>
    </Flex>
  ),
};

/** Its status and due date, and its tasks done from `projects.stats`. */
export const Project: Story = {
  args: { defaultOpen: true, entity: PROJECT, children: <EntityPill entity={PROJECT} /> },
};

/** Its day and time, how it repeats (worded from its RRULE) and where; Join is the page's. */
export const Event: Story = {
  args: {
    defaultOpen: true,
    entity: EVENT,
    actions: (
      <Button size="xs" icon={Video}>
        Join
      </Button>
    ),
    children: <EntityPill entity={EVENT} />,
  },
};

/** When it was edited (Intl's narrow relative time), its project, and its first lines. */
export const Note: Story = {
  args: { defaultOpen: true, entity: NOTE, children: <EntityPill entity={NOTE} /> },
};

/** A subtask's parent task: priority, due date, its subtasks done as a ring pill, and its key. */
export const Task: Story = {
  args: {
    defaultOpen: true,
    entity: {
      type: 'task',
      title: 'Ship the calendar sync',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: storyDate(9),
      subtaskProgress: { completed: 3, total: 4 },
      external: { ...LINEAR, key: 'ENG-118' },
    },
    children: (
      <EntityPill
        entity={{ type: 'parent', title: 'Ship the calendar sync', status: TaskStatus.IN_PROGRESS }}
      />
    ),
  },
};

/** A synced task's key: its status in Linear and when it last synced. */
export const Source: Story = {
  args: {
    defaultOpen: true,
    entity: { type: 'source', title: 'Fix the token refresh race', external: LINEAR },
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

/** A detached task's key: it no longer follows Linear, so no status there and no sync time. */
export const DetachedSource: Story = {
  args: {
    defaultOpen: true,
    entity: {
      type: 'source',
      title: 'Fix the token refresh race',
      external: { ...LINEAR, state: LinkState.DETACHED },
    },
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
    children: <SourcePill detached>ENG-124</SourcePill>,
  },
};

const SUBTASKS = {
  type: 'subtasks',
  subtaskProgress: { completed: 2, total: 7 },
  subtasks: [
    'Move the scheduler onto change listeners',
    'Drop the sync callbacks',
    'Port the event writer',
    'Port the task writer',
    'Update the sync tests',
    'Remove the old hooks',
    'Write the migration note',
  ].map((title, i) => ({
    id: `tsk_sub_${i}` as TaskId,
    title,
    status:
      i < 2 ? TaskStatus.COMPLETED : i === 2 ? TaskStatus.IN_PROGRESS : TaskStatus.NOT_STARTED,
  })),
} satisfies HoverCardEntity;

/**
 * A task's subtask count: how many are done, then its subtasks with their status, open ones first,
 * five at most and then how many more.
 */
export const Subtasks: Story = {
  args: {
    defaultOpen: true,
    entity: SUBTASKS,
    children: (
      <Badge muted icon={<ProgressRing value={2} total={7} size={12} />}>
        2/7
      </Badge>
    ),
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
        entity={{
          type: 'project',
          title: 'A project with a name long enough to end in an ellipsis',
          color: 'green',
          status: ProjectStatus.ACTIVE,
          dueDate: null,
          stats: { numOfCompleted: 6, totalTasks: 10 },
        }}
      />
    </div>
  ),
};

// what a row's pills show in the story below: the fixtures above, under the pill's own name
function storyCard(target: PillTarget) {
  switch (target.type) {
    case 'project':
      return <EntityHoverCardContent entity={{ ...PROJECT, title: target.title }} />;
    case 'event':
      return <EntityHoverCardContent entity={{ ...EVENT, title: target.title }} />;
    case 'note':
      return <EntityHoverCardContent entity={{ ...NOTE, title: target.title }} />;
    case 'task':
      return (
        <EntityHoverCardContent
          entity={{
            type: 'task',
            title: target.title,
            status: TaskStatus.NOT_STARTED,
            priority: TaskPriority.MEDIUM,
            dueDate: storyDate(9),
            subtaskProgress: { completed: 1, total: 5 },
          }}
        />
      );
    case 'source':
      return <EntityHoverCardContent entity={target} />;
    case 'subtasks':
      return <EntityHoverCardContent entity={SUBTASKS} />;
  }
}

/**
 * A task row's pills in a `PillHoverCardsProvider`: each opens its card, one popup for them all, filled by `renderCard` (the app's loads the item; this one draws fixtures).
 */
export const InATaskRow: Story = {
  render: () => (
    <PillHoverCardsProvider renderCard={storyCard}>
      <div style={{ maxWidth: 960 }}>
        <TaskRow task={BUSY_TASK} />
      </div>
    </PillHoverCardsProvider>
  ),
};

/** While the item loads, and once it can no longer be read. */
export const Placeholder: Story = {
  render: () => (
    <Flex gap="3" align="start">
      {[undefined, 'No longer available'].map((message) => (
        <div
          key={message ?? 'loading'}
          style={{
            border: '1px solid var(--edge)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--popover)',
          }}
        >
          <EntityHoverCardPlaceholder title="Website redesign" message={message} />
        </div>
      ))}
    </Flex>
  ),
};
