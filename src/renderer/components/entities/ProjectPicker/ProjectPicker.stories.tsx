import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ProjectPicker, type PickerProject } from './ProjectPicker';

const PROJECTS: PickerProject[] = [
  { id: 'auth', name: 'Auth Overhaul', color: 'blue' },
  { id: 'api', name: 'API Gateway v2', color: 'amber' },
  { id: 'ui', name: 'User Interface Revamp', color: 'indigo' },
  { id: 'ml', name: 'ML Platform', color: 'pink' },
  { id: 'ai', name: 'AI Action Items', color: 'green' },
];

const meta = {
  title: 'Entities/ProjectPicker',
  decorators: [
    (Story) => (
      <div style={{ minHeight: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The task's Project property: one project, ticked; picking closes the menu. */
export const Single: Story = {
  render: function Single() {
    const [value, setValue] = useState('auth');
    const name = PROJECTS.find((p) => p.id === value)?.name ?? 'No project';
    return (
      <ProjectPicker
        projects={PROJECTS}
        defaultOpen
        value={value}
        onValueChange={setValue}
        trigger={<Button icon={Folder}>{name}</Button>}
      />
    );
  },
};

/** Filter › Project: several projects, each ticked one kept. */
export const Multiple: Story = {
  render: function Multiple() {
    const [value, setValue] = useState<string[]>(['auth', 'api']);
    return (
      <ProjectPicker
        projects={PROJECTS}
        multiple
        defaultOpen
        value={value}
        onValueChange={setValue}
        trigger={<Button value={`${value.length}`}>Project</Button>}
      />
    );
  },
};

/**
 * A search's matches (what a page passes once something is typed): each project's `label` is its
 * title with the matches in bold, and "No project" is left out (`showNone={false}`).
 */
export const SearchResults: Story = {
  render: function SearchResults() {
    const [value, setValue] = useState('');
    const matches: PickerProject[] = [
      {
        id: 'api',
        name: 'API Gateway v2',
        label: (
          <>
            <b>API</b> Gateway v2
          </>
        ),
        color: 'amber',
      },
      {
        id: 'ai',
        name: 'AI Action Items',
        label: (
          <>
            <b>A</b>I Action Items
          </>
        ),
        color: 'green',
      },
    ];
    return (
      <ProjectPicker
        projects={matches}
        showNone={false}
        defaultOpen
        value={value}
        onValueChange={setValue}
        trigger={<Button icon={Folder}>Project</Button>}
      />
    );
  },
};
