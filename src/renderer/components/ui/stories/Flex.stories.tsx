import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Flex } from '..';

const meta = {
  title: 'Foundations/Flex',
  component: Flex,
  tags: ['autodocs'],
  args: {
    gap: 3,
    children: (
      <>
        <Button>New Task</Button>
        <Button variant="ghost">View All</Button>
      </>
    ),
  },
} satisfies Meta<typeof Flex>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
