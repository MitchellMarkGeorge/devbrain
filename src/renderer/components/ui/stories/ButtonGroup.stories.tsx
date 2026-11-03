import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, ButtonGroup } from '..';

const meta = {
  title: 'Controls/ButtonGroup',
  component: ButtonGroup,
  tags: ['autodocs'],
  args: {
    children: (
      <>
        <Button icon="chevron-left" aria-label="Previous day" />
        <Button>Today</Button>
        <Button icon="chevron-right" aria-label="Next day" />
      </>
    ),
  },
} satisfies Meta<typeof ButtonGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
