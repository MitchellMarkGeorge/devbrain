import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectCard } from './ProjectCard';
import { AUTH_OVERHAUL, SAMPLE_PROJECTS } from './fixtures';

const meta = {
  title: 'Projects/ProjectCard',
  component: ProjectCard,
  args: AUTH_OVERHAUL,
  decorators: [
    (Story) => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const OnHold: Story = { args: SAMPLE_PROJECTS[3] };
export const NotStarted: Story = { args: SAMPLE_PROJECTS[4] };
/** A completed project ends with when it was done. */
export const Completed: Story = { args: SAMPLE_PROJECTS[5] };
/** Before `projects.stats` loads (or with no tasks): 0%. */
export const NoStats: Story = { args: { stats: undefined } };

/** The Projects cards view: columns of at least 300px, 16px apart */
export const Grid: Story = {
  decorators: [],
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16,
        width: 1000,
      }}
    >
      {SAMPLE_PROJECTS.slice(0, 4).map((sample) => (
        <ProjectCard key={sample.project.title} {...sample} />
      ))}
    </div>
  ),
};
