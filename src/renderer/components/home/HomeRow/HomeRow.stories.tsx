import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Folder, Video } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ColourBar } from '../../ui/ColourBar';
import { Icon } from '../../ui/Icon';
import { Progress } from '../../ui/Progress';
import { HomeRow, HomeRowNote } from './HomeRow';

const meta = {
  title: 'Home/HomeRow',
  component: HomeRow,
  args: { icon: <ColourBar color="green" />, title: 'Mitchell / Jesse 1:1', meta: '10:30' },
  decorators: [
    (Story) => (
      <div style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Meetings: the next meeting filled with `card` and Join from 5 minutes before the start;
 * tomorrow's first meeting dimmed.
 */
export const Meetings: Story = {
  render: () => (
    <div>
      <HomeRow
        current
        icon={<ColourBar color="green" />}
        title="Sprint Planning"
        meta="In 12 min"
        metaTone="today"
      >
        <Button size="xs" icon={Video}>
          Join
        </Button>
      </HomeRow>
      <HomeRow icon={<ColourBar color="green" />} title="Mitchell / Jesse 1:1" meta="10:30" />
      <HomeRow icon={<ColourBar color="blue" />} title="Design Review" meta="1:00" />
      <HomeRow muted icon={<ColourBar color="green" />} title="Daily Standup" meta="Tue 9:30" />
    </div>
  ),
};

/** Recent notes as a list: what the note belongs to, then when it was edited. */
export const Notes: Story = {
  render: () => (
    <div>
      <HomeRow icon={<Icon icon={FileText} />} title="PKCE design notes" meta="6 min ago">
        <HomeRowNote>Auth Overhaul</HomeRowNote>
      </HomeRow>
      <HomeRow icon={<Icon icon={FileText} />} title="Mitchell / Jesse 1:1" meta="40 min ago">
        <HomeRowNote>Meeting note</HomeRowNote>
      </HomeRow>
    </div>
  ),
};

/** Recent projects: the folder in the project's colour, a 96px bar and "3/12", then the due date or status. */
export const Projects: Story = {
  render: () => (
    <div>
      <HomeRow
        icon={<Icon icon={Folder} style={{ color: 'var(--swatch-blue)' }} />}
        title="Auth Overhaul"
        meta="Due Jul 1"
      >
        <Progress value={25} aria-label="Auth Overhaul: 3 of 12 tasks done" style={{ width: 96 }} />
        <HomeRowNote style={{ width: 36 }}>3/12</HomeRowNote>
      </HomeRow>
      <HomeRow
        icon={<Icon icon={Folder} style={{ color: 'var(--swatch-pink)' }} />}
        title="ML Platform"
        meta="On hold"
      >
        <Progress value={60} aria-label="ML Platform: 6 of 10 tasks done" style={{ width: 96 }} />
        <HomeRowNote style={{ width: 36 }}>6/10</HomeRowNote>
      </HomeRow>
    </div>
  ),
};
