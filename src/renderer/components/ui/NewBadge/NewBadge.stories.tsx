import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Folder } from 'lucide-react';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { NewBadge } from './NewBadge';

const meta = {
  title: 'UI/NewBadge',
  component: NewBadge,
  args: { fadeAfter: false },
} satisfies Meta<typeof NewBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Held in place (`fadeAfter={false}`) to show its look */
export const Default: Story = {};

/** On the first-run Home, after the item it marks: it fades after a few seconds */
export const Fading: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <Flex direction="column" gap="3" align="start">
        <Flex gap="2" align="center">
          <Icon icon={Folder} />
          <Text>Getting started</Text>
          <NewBadge key={key} fadeAfter={2000} />
        </Flex>
        <Button size="xs" onClick={() => setKey(key + 1)}>
          Replay
        </Button>
      </Flex>
    );
  },
};
