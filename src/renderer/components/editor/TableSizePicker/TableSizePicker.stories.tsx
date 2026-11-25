import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TableSizePicker, type TableSize } from './TableSizePicker';

const meta = {
  title: 'Editor/TableSizePicker',
  component: TableSizePicker,
} satisfies Meta<typeof TableSizePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pointing at a square highlights its size; clicking would insert it */
export const Default: Story = {
  args: { value: { cols: 3, rows: 3 } },
  render: function Render() {
    const [value, setValue] = useState<TableSize>({ cols: 3, rows: 3 });
    return <TableSizePicker value={value} onValueChange={setValue} />;
  },
};

/** keyboard: the arrow keys are in the grid, with a ring */
export const Keyboard: Story = { args: { value: { cols: 4, rows: 3 }, keyboard: true } };
