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
