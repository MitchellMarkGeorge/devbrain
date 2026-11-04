import type { Meta, StoryObj } from '@storybook/react-vite';
import { Grid } from './Grid';

const Cell = ({ n }: { n: number }) => (
  <div
    style={{
      height: 64,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-xl)',
      background: 'var(--card)',
      boxShadow: '0 0 0 1px var(--edge)',
    }}
  >
    {n}
  </div>
);

const meta = {
  title: 'Layout/Grid',
  component: Grid,
  args: { columns: 3, gap: '4' },
  render: (args) => (
    <Grid {...args}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <Cell key={n} n={n} />
      ))}
    </Grid>
  ),
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Columns: Story = {};

/** Card grids: equal columns, none narrower than 240px */
export const AutoFill: Story = { args: { columns: undefined, minColumnWidth: '240px' } };
