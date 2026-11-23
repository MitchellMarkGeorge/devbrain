import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollArea } from './ScrollArea';

const meta = {
  title: 'UI/ScrollArea',
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

/**
 * `orientation="horizontal"`: a row wider than the area scrolls sideways, under a scrollbar along
 * its bottom edge (the board's columns, when a docked sheet narrows the board).
 */
export const Horizontal: Story = {
  render: (args) => (
    <ScrollArea {...args} orientation="horizontal" style={{ ...box, height: 'auto' }}>
      <div style={{ display: 'flex', gap: 16, padding: '16px 16px 20px' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{ flex: 'none' }}>
            Column {i + 1}
          </span>
        ))}
      </div>
    </ScrollArea>
  ),
};

/**
 * Keyboard focus (Tab to the area; this story focuses it as it opens): a 1px `ring` line inside
 * its edge, as a focused row draws, over the content, so a tinted row doesn't cover it. A click
 * on the content focuses the area without it.
 */
export const KeyboardFocus: Story = {
  render: (args) => (
    <ScrollArea
      {...args}
      style={box}
      viewportRef={(viewport) => viewport?.focus({ preventScroll: true })}
      viewportProps={{ tabIndex: 0 }}
    >
      <div style={{ padding: '8px 0' }}>
        {Array.from({ length: 30 }, (_, i) => (
          <p
            key={i}
            style={{
              margin: 0,
              padding: '8px 16px',
              background: i < 3 ? 'var(--row-selected)' : undefined,
            }}
          >
            Item {i + 1}
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
};
