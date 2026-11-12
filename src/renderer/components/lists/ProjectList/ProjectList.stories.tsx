import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProjectId } from '@common/ids';
import { SAMPLE_PROJECTS } from '../../projects/ProjectCard/fixtures';
import { ProjectList, type ProjectListRow } from './ProjectList';

const PROJECTS: ProjectListRow[] = SAMPLE_PROJECTS.map(({ project, stats }, i) => ({
  ...project,
  id: `prj_${i}` as ProjectId,
  stats: {
    ...stats,
    numOfNotStarted: 0,
    numOfInProgress: 0,
    numOfCancelled: 0,
    numOfOverdue: 0,
  },
}));

// a long workspace: only the rows in view are drawn
const MANY: ProjectListRow[] = Array.from({ length: 1000 }, (_, i) => ({
  ...PROJECTS[i % PROJECTS.length],
  id: `prj_many_${i}` as ProjectId,
  title: `${PROJECTS[i % PROJECTS.length].title} (${i + 1})`,
}));

const meta = {
  title: 'Lists/ProjectList',
  component: ProjectList,
  args: { projects: PROJECTS, onOpen: () => {} },
  decorators: [
    (Story) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: 480, maxWidth: 1152 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Projects list view (Figma `7158:15157`): a row per project, with its status and progress. */
export const Default: Story = {};

/** Two rows next to each other selected: they join into one block, and every row shows its checkbox. */
export const Selected: Story = { args: { defaultSelected: [PROJECTS[1].id, PROJECTS[2].id] } };

/** 1,000 projects: about 30 rows are drawn, and the scrollbar is the whole list's. */
export const Long: Story = { args: { projects: MANY } };
