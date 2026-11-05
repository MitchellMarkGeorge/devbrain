import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectCard } from './ProjectCard';

const meta = {
  title: 'Projects/ProjectCard',
  component: ProjectCard,
  args: {
    name: 'Auth Overhaul',
    color: 'blue',
    due: 'Due Jul 1',
    done: 3,
    total: 12,
    status: 'active',
  },
  argTypes: {
    status: { control: 'inline-radio', options: ['not-started', 'active', 'on-hold', 'completed'] },
    color: { control: 'select', options: ['red', 'amber', 'green', 'blue', 'indigo', 'pink'] },
  },
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
export const OnHold: Story = {
  args: {
    name: 'ML Platform',
    color: 'pink',
    due: 'Due Jul 10',
    done: 6,
    total: 10,
    status: 'on-hold',
  },
};
export const NotStarted: Story = {
  args: {
    name: 'User Interface Revamp',
    color: 'indigo',
    due: 'Due Jul 15',
    done: 0,
    total: 8,
    status: 'not-started',
  },
};
export const Completed: Story = {
  args: {
    name: 'Calendar sync',
    color: 'green',
    due: 'Done Jun 12',
    done: 9,
    total: 9,
    status: 'completed',
  },
};

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
      <ProjectCard
        name="AI Action Items"
        color="green"
        due="Due Jun 26"
        done={3}
        total={6}
        status="active"
      />
      <ProjectCard
        name="API Gateway v2"
        color="amber"
        due="Due Jun 30"
        done={4}
        total={10}
        status="active"
      />
      <ProjectCard
        name="Auth Overhaul"
        color="blue"
        due="Due Jul 1"
        done={3}
        total={12}
        status="active"
      />
      <ProjectCard
        name="ML Platform"
        color="pink"
        due="Due Jul 10"
        done={6}
        total={10}
        status="on-hold"
      />
    </div>
  ),
};
