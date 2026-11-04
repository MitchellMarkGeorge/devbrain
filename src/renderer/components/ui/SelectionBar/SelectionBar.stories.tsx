import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Folder, Trash2 } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '../DropdownMenu';
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
