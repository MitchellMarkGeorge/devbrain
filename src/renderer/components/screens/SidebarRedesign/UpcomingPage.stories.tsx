import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScreenFrame } from '../Shell/AppFrame';
import { RedesignSidebar } from './RedesignSidebar';
import { UpcomingContent } from './UpcomingPage';

const meta = {
  title: 'Screens/Proposals/Upcoming',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The next 14 days as an agenda: Overdue first, then a day per heading; empty days are one line. */
export const Upcoming: Story = {
  render: () => (
    <ScreenFrame title="Upcoming" sidebar={<RedesignSidebar active="Upcoming" />}>
      <UpcomingContent />
    </ScreenFrame>
  ),
};

/** Rescheduling: "Mobile fallback" dragged from Tomorrow onto Wednesday. */
export const Reschedule: Story = {
  render: () => (
    <ScreenFrame title="Upcoming" sidebar={<RedesignSidebar active="Upcoming" />}>
      <UpcomingContent dragging />
    </ScreenFrame>
  ),
};

/** Nothing overdue, in the app's default 1200 × 800 window. */
export const DefaultWindow: Story = {
  render: () => (
    <ScreenFrame
      width={1200}
      height={800}
      title="Upcoming"
      sidebar={<RedesignSidebar active="Upcoming" />}
    >
      <UpcomingContent caughtUp />
    </ScreenFrame>
  ),
};

/** Light theme. */
export const Light: Story = {
  globals: { theme: 'light' },
  render: () => (
    <ScreenFrame title="Upcoming" sidebar={<RedesignSidebar active="Upcoming" />}>
      <UpcomingContent />
    </ScreenFrame>
  ),
};
