import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EntityPill } from '../../ui/EntityPill';
import { ProjectStatusIcon } from '../../ui/ProjectStatusIcon';
import { SourcePill } from '../../ui/SourcePill';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { TrashRow } from '../../ui/TrashRow';
import { AppFrame } from '../Tasks/frame';

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
            kind: 'project',
            title: 'AI Action Items',
            color: 'green',
            trashed: 'Trashed 1d ago',
          }}
          onRestore={() => {}}
          onDelete={() => {}}
        >
          <Badge variant="outline" muted icon={<ProjectStatusIcon status="active" size={12} />}>
            Active
          </Badge>
        </TrashRow>
        <TrashRow
          item={{
            kind: 'task',
            title: 'Summarise sprint feedback',
            status: 'not-started',
            trashed: 'Trashed 1d ago',
          }}
          onRestore={() => {}}
          onDelete={() => {}}
        >
          <EntityPill type="project" color="green">
            AI Action Items
          </EntityPill>
        </TrashRow>
        <TrashRow
          item={{
            kind: 'note',
            title: 'Sprint 14 retro',
            excerpt: 'What went well, what to change and action items for sprint 15.',
            trashed: 'Trashed 3d ago',
          }}
          state="hover"
          onSelect={() => {}}
          onRestore={() => {}}
          onDelete={() => {}}
        />
        <TrashRow
          item={{
            kind: 'task',
            title: 'Set up API Gateway',
            status: 'completed',
            trashed: 'Trashed 5d ago',
          }}
          titlePills={<SourcePill>ENG-102</SourcePill>}
          onRestore={() => {}}
          onDelete={() => {}}
        >
          <EntityPill type="project" color="amber">
            API Gateway v2
          </EntityPill>
        </TrashRow>
        <TrashRow
          item={{
            kind: 'note',
            title: 'Mitchell / Jesse 1:1 notes',
            excerpt: 'Agenda, follow-ups and decisions from the weekly 1:1.',
            trashed: 'Trashed 1w ago',
          }}
          onRestore={() => {}}
          onDelete={() => {}}
        />
      </div>
      <p style={{ ...footnote, margin: 0 }}>Items in the trash are kept until you delete them.</p>
    </AppFrame>
  ),
};
