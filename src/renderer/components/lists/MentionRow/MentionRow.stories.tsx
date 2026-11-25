import type { Meta, StoryObj } from '@storybook/react-vite';
import { MentionRow } from './MentionRow';
import { SAMPLE_MENTIONS } from './fixtures';

const meta = {
  title: 'Lists/MentionRow',
  component: MentionRow,
  args: { mention: SAMPLE_MENTIONS[1], onOpen: () => {} },
  decorators: [
    (Story) => (
      <div style={{ width: 332 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MentionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Hover: Story = { args: { state: 'hover' } };
export const Focus: Story = { args: { state: 'focus' } };

/**
 * Each kind of source: an event's note (drawn as the calendar), a note, a task (its status), an
 * event (its colour), a project (its folder in its colour); "2h ago" within a week, then the date
 */
export const Sources: Story = {
  render: () => (
    <div>
      {SAMPLE_MENTIONS.map((mention) => (
        <MentionRow key={mention.source.id} mention={mention} onOpen={() => {}} />
      ))}
    </div>
  ),
};
