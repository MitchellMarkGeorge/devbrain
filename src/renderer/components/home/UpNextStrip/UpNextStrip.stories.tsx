import type { Meta, StoryObj } from '@storybook/react-vite';
import { Video } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EntityPill } from '../../entities/EntityPill';
import { StatusIcon } from '../../entities/StatusIcon';
import { UpNextStrip } from './UpNextStrip';

const meta = {
  title: 'Home/UpNextStrip',
  component: UpNextStrip,
  decorators: [
    (Story) => (
      <div style={{ width: 824 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UpNextStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The next meeting within the hour. */
export const Meeting: Story = {
  args: {
    state: 'meeting',
    title: 'Sprint Planning',
    color: 'green',
    countdown: 'In 12 min',
    time: '9:00 – 10:00 AM',
    note: <EntityPill type="note">Sprint 15 planning</EntityPill>,
    action: (
      <Button size="sm" icon={Video}>
        Join
      </Button>
    ),
  },
};

/** No meeting soon: how long you're free, what's next, and a task that fits. */
export const Free: Story = {
  args: {
    state: 'free',
    title: 'Until 1:00 PM',
    countdown: '1h 40m',
    next: 'Design Review next',
    nextColor: 'blue',
    suggestion: 'Write PKCE migration guide',
    suggestionIcon: <StatusIcon status="not-started" size={14} />,
  },
};
