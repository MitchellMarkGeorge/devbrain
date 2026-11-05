import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, Folder, Plus } from 'lucide-react';
import { DateRange } from '../DateRange';
import { EntityPill } from '../../entities/EntityPill';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { StatusIcon } from '../../entities/StatusIcon';
import { DetailRow, DetailRows, ReadOnlyRow } from './DetailRow';

const meta = {
  title: 'Detail/DetailRow',
  component: DetailRow,
  decorators: [
    (Story) => (
      <div style={{ width: 348 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DetailRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Status',
    children: (
      <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In progress</EntityPill>
    ),
  },
};

/** A task sheet's properties; an unset value is a muted "+ Add …" pill */
export const TaskProperties: Story = {
  args: { label: '', children: null },
  render: () => (
    <DetailRows>
      <DetailRow label="Status">
        <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In progress</EntityPill>
      </DetailRow>
      <DetailRow label="Priority">
        <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>High</EntityPill>
      </DetailRow>
      <DetailRow label="Dates">
        <DateRange start="Jun 15" due="Jun 24" />
      </DetailRow>
      <DetailRow label="Project">
        <EntityPill glyph={Plus}>Add to project</EntityPill>
      </DetailRow>
      <DetailRow label="Event">
        <EntityPill type="event" color="green">
          Mitchell / Jesse 1:1
        </EntityPill>
        <EntityPill type="event" color="indigo">
          Design Review
        </EntityPill>
        <EntityPill type="event" color="amber">
          Retrospective
        </EntityPill>
      </DetailRow>
    </DetailRows>
  ),
};

/** A synced task's properties: the provider's values as plain text, nothing to click */
export const ReadOnly: Story = {
  args: { label: '', children: null },
  render: () => (
    <DetailRows>
      <ReadOnlyRow label="Status" glyph={<StatusIcon status="in-progress" size={14} />}>
        In Review
      </ReadOnlyRow>
      <ReadOnlyRow label="Priority" glyph={<PriorityIcon priority="high" size={14} />}>
        Urgent
      </ReadOnlyRow>
      <ReadOnlyRow label="Due date" glyph={CalendarDays}>
        Jun 24
      </ReadOnlyRow>
      <ReadOnlyRow label="Project" glyph={Folder} glyphColor="var(--swatch-blue)">
        Auth Overhaul
      </ReadOnlyRow>
    </DetailRows>
  ),
};

/** `vertical`: a 12px label over the value (Figma's PropertyField and DateField) */
export const Vertical: Story = {
  args: { label: '', children: null },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 248 }}>
      <DetailRow orientation="vertical" label="Status">
        <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In progress</EntityPill>
      </DetailRow>
      <DetailRow orientation="vertical" label="Dates">
        <DateRange due="Jun 24" />
      </DetailRow>
      <DetailRow orientation="vertical" label="Dates">
        <DateRange start="Jun 15" due="Jun 24" />
      </DetailRow>
    </div>
  ),
};
