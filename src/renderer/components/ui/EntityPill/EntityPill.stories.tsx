import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, CircleCheck, Plus } from 'lucide-react';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { PriorityIcon } from '../PriorityIcon';
import { ProgressRing } from '../ProgressRing';
import { StatusIcon } from '../StatusIcon';
import { EntityPill } from './EntityPill';

const meta = {
  title: 'Components/EntityPill',
  component: EntityPill,
  args: { type: 'project', color: 'blue', children: 'Website redesign' },
  argTypes: {
    type: { control: 'select', options: ['project', 'note', 'task', 'event', 'parent'] },
    color: {
      control: 'select',
      options: [undefined, 'red', 'amber', 'green', 'blue', 'indigo', 'pink'],
    },
    status: {
      control: 'select',
      options: ['not-started', 'in-progress', 'completed', 'overdue', 'cancelled'],
    },
    prefix: { control: 'text' },
  },
} satisfies Meta<typeof EntityPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Types: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      <EntityPill type="project" color="blue">
        Website redesign
      </EntityPill>
      <EntityPill type="project">No colour</EntityPill>
      <EntityPill type="note">Q3 planning notes</EntityPill>
      <EntityPill type="task" status="in-progress">
        Ship onboarding
      </EntityPill>
      <EntityPill type="parent" status="not-started">
        Calendar sync
      </EntityPill>
      <EntityPill type="event" color="green">
        Mitchell / Jesse 1:1
      </EntityPill>
    </Flex>
  ),
};

/** Property values use the same pill with their own glyph */
export const Properties: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In progress</EntityPill>
      <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>High</EntityPill>
      <EntityPill glyph={CalendarDays}>Jul 1</EntityPill>
      <EntityPill glyph={<ProgressRing value={3} total={12} size={12} />}>
        25% · 3 of 12 done
      </EntityPill>
      <EntityPill glyph={CircleCheck}>3 tasks · 2 in progress</EntityPill>
      <EntityPill glyph={Plus}>Add</EntityPill>
    </Flex>
  ),
};

export const WithPrefix: Story = {
  args: { type: 'event', color: 'indigo', prefix: 'Linked to', children: 'Design review' },
};

/** On a card, a sheet or a selected row, the pill reads as a chip of the page set into the surface */
export const OnSurfaces: Story = {
  render: () => (
    <Stack gap="3">
      {[
        ['var(--background)', 'Page'],
        ['var(--card)', 'Card'],
        ['var(--row-selected)', 'Selected row'],
      ].map(([ground, label]) => (
        <Flex
          key={label}
          gap="3"
          align="center"
          style={{ background: ground, padding: 12, borderRadius: 'var(--radius-xl)' }}
        >
          <Text size="xs" tone="muted" style={{ width: 80 }}>
            {label}
          </Text>
          <EntityPill type="project" color="pink">
            Mobile app
          </EntityPill>
          <EntityPill type="event" color="blue">
            Standup
          </EntityPill>
        </Flex>
      ))}
    </Stack>
  ),
};
