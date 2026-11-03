import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill, Flex } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Content/EntityPill',
  component: EntityPill,
  tags: ['autodocs'],
  args: { type: 'project', color: 'indigo', children: 'DevBrain', onClick: fn() },
} satisfies Meta<typeof EntityPill>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Relations: Story = {
  render: () => (
    <Flex gap={2}>
      {(['project', 'task', 'note', 'event', 'parent'] as const).map((type) => (
        <EntityPill key={type} type={type} color="indigo">
          {type}
        </EntityPill>
      ))}
    </Flex>
  ),
};
