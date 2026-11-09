import { Fragment, useState } from 'react';
import { TaskPriority, TaskStatus } from '@common/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, CircleAlert, Clock, FileText, Folder, Minus } from 'lucide-react';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { StatusIcon } from '../../entities/StatusIcon';
import { GroupHeading } from './GroupHeading';

const meta = {
  title: 'Lists/GroupHeading',
  component: GroupHeading,
  args: {
    label: 'Auth Overhaul',
    icon: Folder,
    color: 'blue',
    count: 12,
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

/** "+" shows while the band is hovered or holds focus. */
export const WithAdd: Story = { args: { onAddTask: () => {} } };

/**
 * One heading per way the list groups: project, status, priority, due date, linked event or note.
 * A group with a colour tints its band; Not started, No priority, This week and a note stay neutral.
 */
export const Kinds: Story = {
  render: () => (
    <div>
      <GroupHeading label="Auth Overhaul" icon={Folder} color="blue" count={12} />
      <GroupHeading
        label="In progress"
        icon={<StatusIcon status={TaskStatus.IN_PROGRESS} size={14} />}
        color="var(--status-in-progress)"
        count={3}
      />
      <GroupHeading
        label="Not started"
        icon={<StatusIcon status={TaskStatus.NOT_STARTED} size={14} />}
        count={2}
      />
      <GroupHeading
        label="High"
        icon={<PriorityIcon priority={TaskPriority.HIGH} size={14} />}
        color="var(--priority-high)"
        count={3}
      />
      <GroupHeading label="No priority" icon={Minus} count={1} />
      <GroupHeading label="Overdue" icon={CircleAlert} color="var(--status-overdue)" count={2} />
      <GroupHeading label="Today" icon={Clock} color="var(--date-today)" count={1} />
      <GroupHeading label="This week" icon={Calendar} count={3} />
      <GroupHeading label="Mitchell / Jesse 1:1" subtitle="Today, 10:00 AM" bar="green" count={1} />
      <GroupHeading label="PKCE design notes" icon={FileText} count={1} />
    </div>
  ),
};

export const Collapsible: Story = {
  render: function Render(args) {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <GroupHeading
        {...args}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onAddTask={() => {}}
      />
    );
  },
};

export const Collapsed: Story = { args: { collapsed: true, onCollapsedChange: () => {} } };

/**
 * In a scrolling list each band pins to the top while its group scrolls; the next band slides
 * over it.
 */
export const Pinned: Story = {
  render: () => (
    <div style={{ height: 240, overflow: 'auto' }}>
      {(['blue', 'amber', 'pink'] as const).map((color, i) => (
        <Fragment key={color}>
          <GroupHeading
            label={['Auth Overhaul', 'API Gateway v2', 'ML Platform'][i]}
            icon={Folder}
            color={color}
            count={6}
          />
          {Array.from({ length: 6 }, (_, n) => (
            <div key={n} style={{ height: 48, padding: '14px 12px' }}>
              Task {n + 1}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  ),
};
