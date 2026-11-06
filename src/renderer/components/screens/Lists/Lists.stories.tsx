import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, LayoutGrid, List, ListFilter, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { NoteRow } from '../../lists/NoteRow';
import { ProjectRow } from '../../lists/ProjectRow';
import { SAMPLE_PROJECTS } from '../../projects/ProjectCard/fixtures';
import { ToggleGroup, ToggleGroupItem } from '../../ui/ToggleGroup';
import { NOTES } from '../Notes/data';
import { AppFrame } from '../Tasks/frame';

const meta = {
  title: 'Screens/Lists',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function ViewToggle() {
  return (
    <ToggleGroup defaultValue="list" aria-label="View">
      <ToggleGroupItem value="list" icon={List} aria-label="List" />
      <ToggleGroupItem value="cards" icon={LayoutGrid} aria-label="Cards" />
    </ToggleGroup>
  );
}

/** Figma "Notes (list)" (7158:11693): the second row pointed at. */
export const NotesList: Story = {
  name: 'Notes (list)',
  render: () => (
    <AppFrame
      active="Notes"
      breadcrumb={['Notes', { label: 'List', icon: List }]}
      toolbarStart={
        <Button icon={ListFilter} value="All">
          Filter
        </Button>
      }
      toolbarEnd={
        <>
          <Button icon={ArrowUpDown} value="Last edited">
            Sort
          </Button>
          <ViewToggle />
          <Button icon={Plus}>New Note</Button>
        </>
      }
    >
      <div role="grid" aria-label="Notes">
        {NOTES.map((note, i) => (
          <NoteRow
            key={note.title}
            note={note}
            state={i === 1 ? 'hover' : undefined}
            onSelect={() => {}}
          />
        ))}
      </div>
    </AppFrame>
  ),
};

/** Figma "Projects (list)" (7158:15157): the second row pointed at. */
export const ProjectsList: Story = {
  name: 'Projects (list)',
  render: () => (
    <AppFrame
      active="Projects"
      breadcrumb={['Projects', { label: 'List', icon: List }]}
      toolbarStart={
        <Button icon={ListFilter} value="Active">
          Filter
        </Button>
      }
      toolbarEnd={
        <>
          <Button icon={ArrowUpDown} value="Due date">
            Sort
          </Button>
          <ViewToggle />
          <Button icon={Plus}>New Project</Button>
        </>
      }
    >
      <div role="grid" aria-label="Projects">
        {SAMPLE_PROJECTS.slice(0, 5).map((sample, i) => (
          <ProjectRow
            key={sample.project.title}
            {...sample}
            state={i === 1 ? 'hover' : undefined}
            onSelect={() => {}}
          />
        ))}
      </div>
    </AppFrame>
  ),
};
