import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollThumb } from './ScrollThumb';

const meta = {
  title: 'Components/ScrollThumb',
  component: ScrollThumb,
} satisfies Meta<typeof ScrollThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

const box = {
  position: 'relative',
  width: 280,
  height: 240,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  padding: '8px 16px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  color: 'var(--foreground)',
  font: 'var(--font-weight-normal) var(--text-sm) / var(--text-sm-leading) var(--font-sans)',
} as const;

/** Scroll the box: the thumb fades in at its right edge, and out 0.8s after scrolling stops. */
export const Default: Story = {
  render: (args) => (
    <div style={box}>
      {Array.from({ length: 30 }, (_, i) => (
        <p key={i} style={{ margin: '8px 0' }}>
          Item {i + 1}
        </p>
      ))}
      <ScrollThumb {...args} />
    </div>
  ),
};

/** Nothing overflows, so no thumb shows. */
export const NoOverflow: Story = {
  render: (args) => (
    <div style={box}>
      <p>Only a little content.</p>
      <ScrollThumb {...args} />
    </div>
  ),
};
