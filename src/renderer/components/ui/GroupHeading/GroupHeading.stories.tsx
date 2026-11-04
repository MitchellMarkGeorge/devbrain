import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleAlert, Folder } from 'lucide-react';
import { StatusIcon } from '../StatusIcon';
import { GroupHeading } from './GroupHeading';

const meta = {
  title: 'Lists/GroupHeading',
  component: GroupHeading,
  args: {
    label: 'Overdue',
    subtitle: 'Oldest due Sep 28',
    icon: CircleAlert,
    iconColor: 'var(--status-overdue)',
    tint: 'var(--status-overdue-tint)',
    done: 1,
    total: 4,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 880 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Kinds: Story = {
  render: () => (
    <div>
      <GroupHeading
        label="Overdue"
        subtitle="Oldest due Sep 28"
        icon={CircleAlert}
        iconColor="var(--status-overdue)"
        tint="var(--status-overdue-tint)"
        done={0}
        total={3}
      />
      <GroupHeading
        label="Mitchell / Jesse 1:1"
        subtitle="Event · Today, 10:00 AM"
        bar="indigo"
        done={2}
        total={3}
      />
      <GroupHeading
        label="DevBrain 1.0"
        subtitle="Project · Due Oct 15"
        icon={Folder}
        iconColor="blue"
        done={3}
        total={12}
      />
      <GroupHeading
        label="Completed"
        icon={<StatusIcon status="completed" />}
        tint="var(--status-completed-tint)"
        done={6}
        total={6}
      />
      <GroupHeading label="Not started" icon={<StatusIcon status="not-started" />} count={9} />
    </div>
  ),
};

export const Collapsible: Story = {
  render: function Render(args) {
    const [collapsed, setCollapsed] = useState(false);
    return <GroupHeading {...args} collapsed={collapsed} onCollapsedChange={setCollapsed} />;
  },
};

export const Collapsed: Story = { args: { collapsed: true } };
