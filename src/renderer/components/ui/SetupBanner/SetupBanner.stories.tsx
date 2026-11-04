import type { Meta, StoryObj } from '@storybook/react-vite';
import { SetupBanner } from './SetupBanner';

const meta = {
  title: 'Home/First run/SetupBanner',
  component: SetupBanner,
  args: {
    description: 'Calendar connected, first task added, first note written.',
    onHide: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 816 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SetupBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
