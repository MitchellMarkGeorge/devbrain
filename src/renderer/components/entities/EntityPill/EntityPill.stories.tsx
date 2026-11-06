import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, CircleCheck, Plus } from 'lucide-react';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { PriorityIcon } from '../PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { StatusIcon } from '../StatusIcon';
import { TaskPriority, TaskStatus } from '@common/types';
import { EntityPill } from './EntityPill';

const meta = {
  title: 'Entities/EntityPill',
  component: EntityPill,
  args: { entity: { type: 'project', title: 'Website redesign', color: 'blue' } },
  argTypes: { prefix: { control: 'text' } },
} satisfies Meta<typeof EntityPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * One per thing it links to, from core's summaries: a project (in its colour, or none), a note, a
 * task and a subtask's parent (their status icons), and an event (its colour's bar). A colour is a
 * swatch name or a `#rrggbb` from core; anything else is ignored.
 */
export const Types: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      <EntityPill entity={{ type: 'project', title: 'Website redesign', color: 'blue' }} />
      <EntityPill entity={{ type: 'project', title: 'No colour', color: null }} />
      <EntityPill entity={{ type: 'project', title: 'Hex colour', color: '#d946ef' }} />
      <EntityPill entity={{ type: 'note', title: 'Q3 planning notes' }} />
      <EntityPill
        entity={{ type: 'task', title: 'Ship onboarding', status: TaskStatus.IN_PROGRESS }}
      />
      <EntityPill
        entity={{ type: 'parent', title: 'Calendar sync', status: TaskStatus.NOT_STARTED }}
      />
      <EntityPill entity={{ type: 'event', title: 'Mitchell / Jesse 1:1', color: 'green' }} />
      <EntityPill entity={{ type: 'event', title: 'Not a colour', color: 'url(evil)' }} />
    </Flex>
  ),
};

/** Property values use the same pill with their own glyph */
export const Properties: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      <EntityPill glyph={<StatusIcon status={TaskStatus.IN_PROGRESS} size={12} />}>
        In progress
      </EntityPill>
      <EntityPill glyph={<PriorityIcon priority={TaskPriority.HIGH} size={12} />}>High</EntityPill>
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
  args: {
    entity: { type: 'event', title: 'Design review', color: 'indigo' },
    prefix: 'Linked to',
  },
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
          <EntityPill entity={{ type: 'project', title: 'Mobile app', color: 'pink' }} />
          <EntityPill entity={{ type: 'event', title: 'Standup', color: 'blue' }} />
        </Flex>
      ))}
    </Stack>
  ),
};
