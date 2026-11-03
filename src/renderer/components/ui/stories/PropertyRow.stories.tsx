import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateRange, EntityPill, PriorityIcon, PropertyRow, SourcePill, StatusIcon } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Content/PropertyRow',
  component: PropertyRow,
  tags: ['autodocs'],
  args: {
    properties: [
      <EntityPill key="status" icon={<StatusIcon status="in-progress" size={12} />}>
        In progress
      </EntityPill>,
      <EntityPill key="priority" icon={<PriorityIcon priority="high" size={12} />}>
        High
      </EntityPill>,
      <DateRange key="dates" due="Nov 12" />,
      <EntityPill key="project" type="project" color="indigo">
        DevBrain
      </EntityPill>,
    ],
    links: [<SourcePill key="source">ENG-124</SourcePill>],
    note: 'Synced 3 min ago',
    onAdd: fn(),
  },
} satisfies Meta<typeof PropertyRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
