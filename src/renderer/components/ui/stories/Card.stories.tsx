import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Card, Text } from '..';

const meta = {
  title: 'Content/Card',
  component: Card,
  tags: ['autodocs'],
  args: {
    title: 'Your work, in one place',
    description: 'Tasks, notes and events for the day ahead.',
    children: <Text>You have 12 tasks and 4 meetings today.</Text>,
    action: <Button size="xs">View All</Button>,
  },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
