import type { Meta, StoryObj } from '@storybook/react-vite';
import { SectionHeading } from './SectionHeading';

const meta = {
  title: 'Home/SectionHeading',
  component: SectionHeading,
  args: { title: 'Today’s schedule', link: 'View calendar' },
  decorators: [
    (Story) => (
      <div style={{ width: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With a quiet description after the title (Home — free day's "Up next"). */
export const WithDescription: Story = {
  args: { title: 'Up next', description: 'Tomorrow and later this week', link: 'All tasks' },
};

export const TitleOnly: Story = { args: { title: 'Projects', link: undefined } };
