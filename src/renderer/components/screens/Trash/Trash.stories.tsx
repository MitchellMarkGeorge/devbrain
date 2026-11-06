import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectStatus, TaskStatus } from '@common/types';
import { ArrowUpDown } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EntityPill } from '../../entities/EntityPill';
import { ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { SourcePill } from '../../entities/SourcePill';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { TrashRow } from '../../lists/TrashRow';
import { AppFrame } from '../Tasks/frame';
import { storyAgo } from '../../lib/story-dates';

const meta = {
  title: 'Screens/Trash',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const footnote = {
  padding: '16px 0 0 36px',
  color: 'var(--subtle-foreground)',
  font: 'var(--font-weight-normal) var(--text-xs) / var(--text-xs-leading) var(--font-sans)',
};

/** Figma "Trash" (7159:11875): projects, tasks and notes, the note in the middle pointed at. */
export const Trash: Story = {
  render: () => (
    <AppFrame
      active="Trash"
      breadcrumb={['Trash']}
      toolbarStart={
        <ToggleGroup
          aria-label="Show"
          defaultValue="all"
          items={[
            { value: 'all', label: 'All' },
            { value: 'projects', label: 'Projects' },
            { value: 'tasks', label: 'Tasks' },
            { value: 'notes', label: 'Notes' },
          ]}
        />
      }
      toolbarEnd={
        <Button icon={ArrowUpDown} value="Date trashed">
          Sort
        </Button>
      }
    >
      <div role="grid" aria-label="Trash">
        <TrashRow
          item={{
            entityType: 'projects',
            title: 'AI Action Items',
            color: 'green',
            archivedAt: storyAgo(60 * 24),
          }}
          onRestore={() => {}}
          onDelete={() => {}}
        >
          <Badge
            variant="outline"
            muted
            icon={<ProjectStatusIcon status={ProjectStatus.ACTIVE} size={12} />}
          >
            Active
          </Badge>
        </TrashRow>
        <TrashRow
          item={{
            entityType: 'tasks',
            title: 'Summarise sprint feedback',
            status: TaskStatus.NOT_STARTED,
            archivedAt: storyAgo(60 * 24),
          }}
          onRestore={() => {}}
          onDelete={() => {}}
        >
          <EntityPill entity={{ type: 'project', title: 'AI Action Items', color: 'green' }} />
        </TrashRow>
        <TrashRow
          item={{
            entityType: 'notes',
            title: 'Sprint 14 retro',
            preview: 'What went well, what to change and action items for sprint 15.',
            archivedAt: storyAgo(60 * 24 * 3),
          }}
          state="hover"
          onSelect={() => {}}
          onRestore={() => {}}
          onDelete={() => {}}
        />
        <TrashRow
          item={{
            entityType: 'tasks',
            title: 'Set up API Gateway',
            status: TaskStatus.COMPLETED,
            archivedAt: storyAgo(60 * 24 * 5),
          }}
          titlePills={<SourcePill>ENG-102</SourcePill>}
          onRestore={() => {}}
          onDelete={() => {}}
        >
          <EntityPill entity={{ type: 'project', title: 'API Gateway v2', color: 'amber' }} />
        </TrashRow>
        <TrashRow
          item={{
            entityType: 'notes',
            title: 'Mitchell / Jesse 1:1 notes',
            preview: 'Agenda, follow-ups and decisions from the weekly 1:1.',
            archivedAt: storyAgo(60 * 24 * 8),
          }}
          onRestore={() => {}}
          onDelete={() => {}}
        />
      </div>
      <p style={{ ...footnote, margin: 0 }}>Items in the trash are kept until you delete them.</p>
    </AppFrame>
  ),
};
