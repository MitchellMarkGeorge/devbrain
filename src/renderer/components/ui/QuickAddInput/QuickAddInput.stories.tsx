import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuickAddInput } from './QuickAddInput';

const meta = {
  title: 'Home/QuickAddInput',
  component: QuickAddInput,
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickAddInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithText: Story = { args: { defaultValue: 'Draft the Q3 roadmap' } };
