import type { Meta, StoryObj } from '@storybook/react-vite';
import { EventBlock, NowIndicator } from './EventBlock';

const meta = {
  title: 'Calendar/EventBlock',
  component: EventBlock,
  args: { title: 'Mitchell / Jesse 1:1', time: '10:00 – 10:30 AM', color: 'indigo', meeting: true },
  argTypes: {
    color: { control: 'select', options: ['red', 'amber', 'green', 'blue', 'indigo', 'pink'] },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 160 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EventBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { style: { height: 56 } } };

export const Short: Story = {
  args: {
    title: 'Standup',
    time: '9:00 AM',
    color: 'green',
    meeting: false,
    size: 'compact',
    style: { height: 22 },
  },
};

/** A slice of a day column: hour lines, two events and the red now line */
export const InDayColumn: Story = {
  decorators: [],
  render: () => {
    const hour = 48;
    return (
      <div
        style={{
          position: 'relative',
          width: 200,
          height: hour * 4,
          backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hour}px)`,
        }}
      >
        <EventBlock
          title="Standup"
          time="9:00 AM"
          color="green"
          size="compact"
          style={{ position: 'absolute', top: 1, left: 4, right: 4, height: hour / 2 - 2 }}
        />
        <EventBlock
          title="Design review: board cards"
          time="10:00 – 11:00 AM"
          color="pink"
          style={{ position: 'absolute', top: hour + 1, left: 4, right: 4, height: hour - 2 }}
        />
        <NowIndicator style={{ position: 'absolute', top: hour * 2.6 }} />
      </div>
    );
  },
};
