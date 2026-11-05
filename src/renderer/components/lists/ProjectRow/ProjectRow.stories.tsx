import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectRow } from './ProjectRow';

const meta = {
  title: 'Lists/ProjectRow',
  component: ProjectRow,
  args: {
    project: {
      name: 'Auth Overhaul',
      color: 'blue',
      status: 'active',
      progress: 25,
      due: 'Due Jul 1',
    },
    onSelect: () => {},
  },
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

export const Statuses: Story = {
  render: () => (
    <div>
      <ProjectRow
        project={{
          name: 'API Gateway v2',
          color: 'amber',
          status: 'active',
          progress: 40,
          due: 'Due Jun 30',
        }}
      />
      <ProjectRow
        project={{
          name: 'ML Platform',
          color: 'pink',
          status: 'on-hold',
          progress: 60,
          due: 'Due Jul 10',
        }}
      />
      <ProjectRow
        project={{
          name: 'User Interface Revamp',
          color: 'indigo',
          status: 'not-started',
          progress: 0,
          due: 'Due Jul 15',
        }}
      />
    </div>
  ),
};

/** Home's Recent projects: a 96px bar and "3/12", then the due date, or the status without one. */
export const Compact: Story = {
  render: () => (
    <div style={{ width: 800 }}>
      <ProjectRow
        compact
        project={{ name: 'Auth Overhaul', color: 'blue', done: 3, total: 12, due: 'Due Jul 1' }}
      />
      <ProjectRow
        compact
        project={{ name: 'API Gateway v2', color: 'amber', done: 4, total: 10, due: 'Due Jun 30' }}
      />
      <ProjectRow
        compact
        project={{ name: 'ML Platform', color: 'pink', done: 6, total: 10, status: 'on-hold' }}
      />
    </div>
  ),
};
