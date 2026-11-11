import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../ui/Button';
import { Copy, Folder, Trash2 } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '../../ui/DropdownMenu';
import { SelectionBar } from './SelectionBar';

const meta = {
  title: 'Lists/SelectionBar',
  component: SelectionBar,
  args: { count: 3, floating: false },
} satisfies Meta<typeof SelectionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithMoreMenu: Story = {
  args: {
    more: (
      <>
        <DropdownMenuItem icon={Folder}>Move to project</DropdownMenuItem>
        <DropdownMenuItem icon={Copy} shortcut="⌘D">
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Trash2} variant="destructive">
          Move to trash
        </DropdownMenuItem>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ paddingTop: 160 }}>
        <Story />
      </div>
    ),
  ],
};

/** It rises and fades in as rows are selected, and sinks back as the selection clears. */
export const Animated: Story = {
  render: function Render(args) {
    const [count, setCount] = useState(0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" onClick={() => setCount((n) => n + 1)}>
            Select a row
          </Button>
          <Button size="sm" onClick={() => setCount(0)}>
            Clear
          </Button>
        </div>
        <div style={{ height: 48 }}>
          <SelectionBar {...args} open={count > 0} count={count} onClear={() => setCount(0)} />
        </div>
      </div>
    );
  },
};
