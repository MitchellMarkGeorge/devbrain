import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinkState, Provider } from '@common/types';
import { storyAgo } from '../../lib/story-dates';
import { AUTH_OVERHAUL, SAMPLE_PROJECTS } from '../../projects/ProjectCard/fixtures';
import { ProjectRow } from './ProjectRow';

const meta = {
  title: 'Lists/ProjectRow',
  component: ProjectRow,
  args: { ...AUTH_OVERHAUL, onSelect: () => {} },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1152 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Hover: Story = { args: { state: 'hover' } };

/** Each status, from core's projects and their stats; a completed one shows when it was done. */
export const Statuses: Story = {
  render: () => (
    <div>
      {SAMPLE_PROJECTS.slice(1).map((sample) => (
        <ProjectRow key={sample.project.title} {...sample} />
      ))}
    </div>
  ),
};

/** A project synced from Linear shows where it comes from right after its name, as a task's key. */
export const Synced: Story = {
  args: {
    project: {
      ...AUTH_OVERHAUL.project,
      external: {
        provider: Provider.LINEAR,
        state: LinkState.SYNCED,
        key: null,
        url: 'https://linear.app/devbrain/project/auth-overhaul',
        statusLabel: 'In Progress',
        priorityLabel: null,
        lastSyncedAt: storyAgo(3),
      },
    },
  },
};

/** Without a due date the date column reads "No date". */
export const NoDate: Story = {
  args: { project: { ...AUTH_OVERHAUL.project, dueDate: null } },
};
