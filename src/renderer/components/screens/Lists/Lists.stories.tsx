import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from 'lucide-react';
import { DemoToolbarEnd, DemoToolbarStart } from '../../lists/ListToolbar/fixtures';
import { NoteRow } from '../../lists/NoteRow';
import { ProjectRow } from '../../lists/ProjectRow';
import { SAMPLE_PROJECTS } from '../../projects/ProjectCard/fixtures';
import { NOTES } from '../Notes/data';
import { AppFrame } from '../Tasks/frame';

const meta = {
  title: 'Screens/Lists',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma "Notes (list)" (7158:11693): the second row pointed at. */
export const NotesList: Story = {
  name: 'Notes (list)',
  render: () => (
    <AppFrame
      active="Notes"
      breadcrumb={['Notes', { label: 'List', icon: List }]}
      toolbarStart={<DemoToolbarStart list="notes" />}
      toolbarEnd={<DemoToolbarEnd list="notes" />}
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
      toolbarStart={<DemoToolbarStart list="projects" />}
      toolbarEnd={<DemoToolbarEnd list="projects" />}
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
