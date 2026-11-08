import type { Meta, StoryObj } from '@storybook/react-vite';
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
