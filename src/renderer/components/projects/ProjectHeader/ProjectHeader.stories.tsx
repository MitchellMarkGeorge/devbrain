import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { AUTH_OVERHAUL } from '../ProjectCard/fixtures';
import { Folder } from 'lucide-react';
import { EditorTitle } from '../../editor/EditorContent';
import { Icon } from '../../ui/Icon';
import { DatePicker } from '../../ui/DatePicker';
import { ProjectHeader } from './ProjectHeader';

const meta = {
  title: 'Projects/ProjectHeader',
  component: ProjectHeader,
  args: {
    project: AUTH_OVERHAUL.project,
    meta: '30 days left',
    description: (
      <>
        <p>
          The implicit grant is deprecated under OAuth 2.1: access tokens come back in the redirect
          URI fragment, where browser history and scripts on the page can leak them. PKCE closes
          that gap.
        </p>
        <p>This project moves every first-party client to the code flow with PKCE by Jul 1.</p>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 760 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A new project: a due date only, no description */
export const NewProject: Story = {
  args: {
    project: {
      title: 'Billing Revamp',
      status: ProjectStatus.NOT_STARTED,
      startDate: null,
      dueDate: storyDate(40),
    },
    meta: undefined,
    description: undefined,
  },
};

/** Past its due date and still open: the due date's glyph turns red. */
export const Overdue: Story = {
  args: { project: { ...AUTH_OVERHAUL.project, dueDate: storyDate(-2) }, meta: '2 days overdue' },
};

/**
 * The project page's header: its tile, the name an editable `EditorTitle` (`title`), and each date
 * pill opening its picker (`duePicker`, `startPicker`); with pickers and no due date, the dates
 * pill reads "Due date".
 */
export const Editable: Story = {
  args: {
    project: { ...AUTH_OVERHAUL.project, startDate: null, dueDate: null },
    meta: undefined,
    icon: (
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'color-mix(in oklab, var(--swatch-blue) 14%, transparent)',
          color: 'var(--swatch-blue)',
        }}
      >
        <Icon icon={Folder} size={20} />
      </span>
    ),
    title: (
      <EditorTitle size="lg" contentEditable suppressContentEditableWarning placeholder="Name">
        Auth Overhaul
      </EditorTitle>
    ),
    duePicker: <DatePicker today={storyDate(0)} onChange={() => {}} />,
    startPicker: <DatePicker today={storyDate(0)} onChange={() => {}} />,
  },
};
