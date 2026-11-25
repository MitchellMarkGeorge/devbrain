import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DropdownMenu, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { TableHandle } from '../TableHandle';
import { TableMenu, type TableAlignment } from './TableMenu';

const meta = {
  title: 'Editor/TableMenu',
  component: TableMenu,
  decorators: [
    (Story) => (
      <div style={{ minHeight: 460, paddingTop: 8 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TableMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => undefined;

/** A column's menu, open from its handle: the alignment first, then sort, insert, move */
export const Column: Story = {
  args: { axis: 'column', label: 'Column · p95 (ms)' },
  render: function Render() {
    const [alignment, setAlignment] = useState<TableAlignment>('right');
    return (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger render={<TableHandle axis="column" active />} />
        <TableMenu
          axis="column"
          label="Column · p95 (ms)"
          alignment={alignment}
          onAlignmentChange={setAlignment}
          numeric
          onSort={noop}
          onInsertBefore={noop}
          onInsertAfter={noop}
          onMoveBefore={noop}
          onDuplicate={noop}
          onClear={noop}
          onDelete={noop}
        />
      </DropdownMenu>
    );
  },
};

/** A body row's menu; Move up is disabled on the first row under the header */
export const Row: Story = {
  args: { axis: 'row', label: 'Row 1' },
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<TableHandle axis="row" active />} />
      <TableMenu
        axis="row"
        label="Row 1"
        onInsertBefore={noop}
        onInsertAfter={noop}
        onMoveAfter={noop}
        onDuplicate={noop}
        onClear={noop}
        onDelete={noop}
      />
    </DropdownMenu>
  ),
};

/** The header row's menu: Turn into a normal row in place of moving */
export const HeaderRow: Story = {
  args: { axis: 'row', label: 'Header row' },
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<TableHandle axis="row" active />} />
      <TableMenu
        axis="row"
        label="Header row"
        headerRow
        onToggleHeader={noop}
        onInsertAfter={noop}
        onClear={noop}
        onDelete={noop}
      />
    </DropdownMenu>
  ),
};
