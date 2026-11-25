import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '../../ui/Tooltip';
import { TableAddButton, TableHandle, TableInsertButton } from './TableHandle';

const meta = {
  title: 'Editor/TableHandle',
  component: TableHandle,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof TableHandle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** axis=column: above the column under the pointer */
export const Column: Story = { args: { axis: 'column' } };

/** axis=row: left of the row under the pointer */
export const Row: Story = { args: { axis: 'row' } };

/** active: its menu is open, or it is being dragged */
export const Active: Story = { args: { axis: 'column', active: true } };

/**
 * The handles, a "+" and the add bars around a table, placed as the editor places them: the
 * column handle over the second column, the row handle beside the second row, a "+" on the line
 * between the first two columns
 */
export const AroundATable: Story = {
  args: { axis: 'column' },
  render: () => {
    const cell = {
      padding: '6px 8px',
      borderBottom: '1px solid var(--border)',
      width: 120,
    } as const;
    return (
      <div style={{ position: 'relative', width: 360, margin: '32px 0 0 32px' }}>
        <table style={{ borderCollapse: 'collapse', font: '14px/20px var(--font-sans)' }}>
          <tbody>
            {[
              ['Endpoint', 'Method', 'p95'],
              ['/v2/tasks', 'GET', '84'],
              ['/v2/sync', 'POST', '340'],
            ].map((row) => (
              <tr key={row[0]}>
                {row.map((text) => (
                  <td key={text} style={cell}>
                    {text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <TableHandle axis="column" style={{ position: 'absolute', left: 168, top: -18 }} />
        <TableHandle axis="row" style={{ position: 'absolute', left: -18, top: 40 }} />
        <TableInsertButton axis="column" style={{ position: 'absolute', left: 128, top: -20 }} />
        <TableAddButton axis="row" style={{ position: 'absolute', left: 0, right: 0, top: 104 }} />
        <TableAddButton
          axis="column"
          style={{ position: 'absolute', left: 365, top: 0, height: 99 }}
        />
      </div>
    );
  },
};
