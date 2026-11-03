import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, Grid } from '..';

const meta = {
  title: 'Foundations/Grid',
  component: Grid,
  tags: ['autodocs'],
  args: {
    columns: 3,
    gap: 4,
    children: (
      <>
        <Card title="Tasks">12 open</Card>
        <Card title="Projects">3 active</Card>
        <Card title="Notes">24 notes</Card>
      </>
    ),
  },
} satisfies Meta<typeof Grid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
