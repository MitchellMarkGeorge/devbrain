import type { Meta, StoryObj } from '@storybook/react-vite';
import { Heading, Stack, Text } from '..';

const meta = {
  title: 'Foundations/Stack',
  component: Stack,
  tags: ['autodocs'],
  args: {
    gap: 3,
    children: (
      <>
        <Heading>Today</Heading>
        <Text tone="muted">You have 4 tasks and 2 meetings.</Text>
      </>
    ),
  },
} satisfies Meta<typeof Stack>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
