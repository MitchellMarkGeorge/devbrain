import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuickCapture } from './QuickCapture';

const meta = {
  title: 'Home/QuickCapture',
  component: QuickCapture,
  decorators: [
    (Story) => (
      <div style={{ width: 824 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickCapture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Note: Story = { args: { defaultKind: 'note', defaultValue: 'Kickoff notes' } };
