import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '../../ui/Tooltip';
import type { TableAlignment } from '../TableMenu';
import { TableCellToolbar, TableToolbar } from './TableToolbar';

const meta = {
  title: 'Editor/TableToolbar',
  component: TableToolbar,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ paddingTop: 40 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof TableToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The table's bar: Header row on, a 4 × 5 table */
export const Default: Story = { args: { headerRow: true, rows: 5, cols: 4 } };

/** Header row off */
export const WithoutHeader: Story = { args: { headerRow: false, rows: 3, cols: 3 } };

/** The bar over a block of selected cells, its columns all right-aligned */
export const SelectedCells: Story = {
  args: { headerRow: true, rows: 5, cols: 4 },
  render: function Render() {
    const [align, setAlign] = useState<TableAlignment | null>('right');
    return (
      <TableCellToolbar
        rows={2}
        cols={3}
        align={align}
        onAlignChange={setAlign}
        onClear={() => undefined}
        onDeleteRows={() => undefined}
        onDeleteColumns={() => undefined}
      />
    );
  },
};

/** Selected cells whose columns are aligned differently: no alignment pressed */
export const MixedAlignment: Story = {
  args: { headerRow: true, rows: 5, cols: 4 },
  render: () => <TableCellToolbar rows={1} cols={2} align={null} />,
};
