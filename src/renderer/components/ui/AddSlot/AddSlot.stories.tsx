import type { Meta, StoryObj } from '@storybook/react-vite';
import { AddSlot } from './AddSlot';

const meta = {
  title: 'Components/AddSlot',
  component: AddSlot,
  args: { children: 'Add a note' },
  decorators: [
    (Story) => (
      <div style={{ width: 348 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In a sheet: "Add a note", "Link a task" */
export const Default: Story = {};

/** On a task page, where the note card would be */
export const Large: Story = {
  args: { size: 'lg', children: 'Add a task note' },
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
};
