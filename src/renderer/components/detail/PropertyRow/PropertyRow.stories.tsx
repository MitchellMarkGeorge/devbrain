import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority } from '@common/types';
import { TaskStatus } from '@common/types';
import { GitPullRequest } from 'lucide-react';
import { Heading } from '../../layout/Heading';
import { Stack } from '../../layout/Flex';
import { DateRange } from '../DateRange';
import { EntityPill } from '../../entities/EntityPill';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { SyncedBadge } from '../../entities/SyncedBadge';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskNoteCard } from '../TaskNoteCard';
import { PropertyRow, TASK_ADD_ITEMS } from './PropertyRow';

const meta = {
  title: 'Detail/PropertyRow',
  component: PropertyRow,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720, minHeight: 260 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    properties: (
      <>
        <EntityPill glyph={<StatusIcon status={TaskStatus.IN_PROGRESS} size={12} />}>
          In progress
        </EntityPill>
        <EntityPill glyph={<PriorityIcon priority={TaskPriority.HIGH} size={12} />}>
          High
        </EntityPill>
        <DateRange due="Jul 1" />
        <EntityPill entity={{ type: 'project', title: 'Website redesign', color: 'blue' }} />
      </>
    ),
    addItems: TASK_ADD_ITEMS.filter((i) => i.key !== 'priority' && i.key !== 'project'),
  },
} satisfies Meta<typeof PropertyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A local task: properties and "+ Add" (Parent task, Event, Pull request still unset), no links */
export const LocalTask: Story = {};

/** A task page header: the title, then the property rows */
export const TaskPageHeader: Story = {
  render: (args) => (
    <Stack gap="4">
      <Heading level={1} variant="document">
        Design the onboarding flow
      </Heading>
      <PropertyRow
        {...args}
        links={
          <>
            <EntityPill
              entity={{ type: 'event', title: 'Mitchell / Jesse 1:1', color: 'indigo' }}
            />
            <EntityPill
              entity={{
                type: 'parent',
                title: 'Ship onboarding v2',
                status: TaskStatus.IN_PROGRESS,
              }}
            />
          </>
        }
      />
      <TaskNoteCard
        title="Onboarding flow notes"
        project="Website redesign"
        projectColor="blue"
        tasksSummary="2 tasks · 1 in progress"
        updated="2h ago"
      />
    </Stack>
  ),
};

/** A synced Linear task: the provider's values, no "+ Add", and a quiet sync note */
export const SyncedTask: Story = {
  args: {
    addable: false,
    properties: (
      <>
        <EntityPill glyph={<StatusIcon status={TaskStatus.IN_PROGRESS} size={12} />}>
          In progress
        </EntityPill>
        <EntityPill glyph={<PriorityIcon priority={TaskPriority.MEDIUM} size={12} />}>
          Medium
        </EntityPill>
        <DateRange start="Jun 24" due="Jul 1" />
        <EntityPill entity={{ type: 'project', title: 'Platform', color: 'green' }} />
      </>
    ),
    links: (
      <>
        <SyncedBadge>Linear · ENG-124</SyncedBadge>
        <EntityPill glyph={GitPullRequest}>#482 Fix token refresh</EntityPill>
      </>
    ),
    note: 'Synced 3 min ago',
  },
};

/** Detached from Linear: "+ Add" comes back and edits stay local */
export const DetachedTask: Story = {
  args: {
    ...SyncedTask.args,
    addable: true,
    note: 'Edits stay in DevBrain',
  },
};

/** A project: status, dates and a progress pill */
export const Project: Story = {
  args: {
    properties: (
      <>
        <EntityPill glyph={<StatusIcon status={TaskStatus.IN_PROGRESS} size={12} />}>
          In progress
        </EntityPill>
        <DateRange start="Jun 2" due="Aug 29" />
        <EntityPill glyph={<ProgressRing value={3} total={12} size={12} />}>
          25% · 3 of 12 done
        </EntityPill>
      </>
    ),
    addItems: TASK_ADD_ITEMS.filter((i) => i.key === 'event'),
  },
};
