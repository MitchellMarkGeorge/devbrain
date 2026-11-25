import type { Meta, StoryObj } from '@storybook/react-vite';
import { SAMPLE_MENTIONS } from '../../lists/MentionRow/fixtures';
import { MentionsPill, MentionsSection } from './MentionsSection';

const meta = {
  title: 'Detail/MentionsSection',
  component: MentionsSection,
  args: { mentions: SAMPLE_MENTIONS, onOpen: () => {} },
  decorators: [
    (Story) => (
      <div style={{ width: 348, minHeight: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MentionsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In a sheet: folded to its heading and count until opened */
export const Folded: Story = {};
/** Opened: five rows, then "Show 2 more" */
export const Open: Story = { args: { defaultOpen: true } };
/** Nothing mentions it: no count, and the empty line when opened */
export const Empty: Story = { args: { mentions: [], defaultOpen: true } };

/** On a page: "@ 7 mentions", opening every row in a popover under it */
export const Pill: Story = {
  render: (args) => <MentionsPill mentions={args.mentions} onOpen={args.onOpen} defaultOpen />,
};
