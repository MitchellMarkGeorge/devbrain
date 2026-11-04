import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { PriorityIcon } from '../PriorityIcon';
import { PRIORITY_LABELS, type Priority } from '../types';
import { PriorityMenu } from './PriorityMenu';

const trigger = (priority: Priority) => (
  <button
    type="button"
    aria-label={`Priority: ${PRIORITY_LABELS[priority]}`}
    style={{
      display: 'grid',
      placeItems: 'center',
      width: 24,
      height: 24,
      border: 0,
      borderRadius: 6,
      background: 'transparent',
      cursor: 'pointer',
    }}
  >
    <PriorityIcon priority={priority} />
  </button>
);

const meta = {
  title: 'Lists/PriorityMenu',
  component: PriorityMenu,
  args: { priority: 'high', trigger: trigger('high') },
  decorators: [
    (Story) => (
      <div style={{ paddingBottom: 160 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PriorityMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The current priority is ticked and highlighted; the others show ⇧2, ⇧3. */
export const Open: Story = { args: { defaultOpen: true } };

export const Interactive: Story = {
  render: function Render() {
    const [priority, setPriority] = useState<Priority>('medium');
    return (
      <Flex gap="2" align="center">
        <PriorityMenu
          priority={priority}
          onPriorityChange={setPriority}
          trigger={trigger(priority)}
        />
        <Text tone="muted">{PRIORITY_LABELS[priority]}</Text>
      </Flex>
    );
  },
};
