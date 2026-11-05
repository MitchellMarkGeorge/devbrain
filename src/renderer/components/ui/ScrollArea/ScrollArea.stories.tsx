import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollArea } from './ScrollArea';

const meta = {
  title: 'Components/ScrollArea',
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const box = {
  width: 280,
  height: 240,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  color: 'var(--foreground)',
  font: 'var(--font-weight-normal) var(--text-sm) / var(--text-sm-leading) var(--font-sans)',
} as const;

const items = (count: number) => (
  <div style={{ padding: '8px 16px' }}>
    {Array.from({ length: count }, (_, i) => (
      <p key={i} style={{ margin: '8px 0' }}>
        Item {i + 1}
      </p>
    ))}
  </div>
);

/**
 * Scroll the box, or point at it: the scrollbar shows at its right edge, and fades out 0.8s after
 * scrolling stops. Drag the thumb or click the track to scroll.
 */
export const Default: Story = {
  render: (args) => (
    <ScrollArea {...args} style={box}>
      {items(30)}
    </ScrollArea>
  ),
};

/** Nothing overflows, so no scrollbar shows. */
export const NoOverflow: Story = {
  render: (args) => (
    <ScrollArea {...args} style={box}>
      {items(2)}
    </ScrollArea>
  ),
};
