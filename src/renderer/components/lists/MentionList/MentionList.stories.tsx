import type { Meta, StoryObj } from '@storybook/react-vite';
import { SAMPLE_MENTIONS } from '../MentionRow/fixtures';
import { MentionList } from './MentionList';

const meta = {
  title: 'Lists/MentionList',
  component: MentionList,
  args: { mentions: SAMPLE_MENTIONS, onOpen: () => {} },
  decorators: [
    (Story) => (
      <div style={{ width: 332 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MentionList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** More than fit: the first five, then "Show 2 more" */
export const Default: Story = {};
/** A few, all shown */
export const Few: Story = { args: { mentions: SAMPLE_MENTIONS.slice(0, 3) } };
/** Nothing mentions it */
export const Empty: Story = { args: { mentions: [] } };
