import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ClipboardCopy,
  Copy,
  Ellipsis,
  FileText,
  FolderKanban,
  Heading1,
  Heading2,
  Link,
  List,
  Minus,
  Pilcrow,
  Trash2,
  CornerLeftUp,
  ArrowDownUp,
} from 'lucide-react';
import { Button } from '../Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';

const meta = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  decorators: [
    (Story) => (
      <div style={{ minHeight: 340 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The "…" menu of a task page: its own actions, Copy as Markdown, then Move to trash last. */
export const TaskActions: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger
        render={<Button size="icon-sm" variant="ghost" icon={Ellipsis} aria-label="More actions" />}
      />
      <DropdownMenuContent>
        <DropdownMenuItem icon={FolderKanban}>Convert to project</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={Link}>Link to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent width="sm">
            <DropdownMenuItem icon={FileText}>Note</DropdownMenuItem>
            <DropdownMenuItem icon={FolderKanban}>Project</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem icon={CornerLeftUp}>Make subtask of</DropdownMenuItem>
        <DropdownMenuItem icon={Copy} shortcut="⌘D">
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={ClipboardCopy}>Copy as Markdown</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Trash2} variant="destructive">
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** The editor's block menu: a labelled group with shortcuts. */
export const TurnInto: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger render={<Button />}>Turn into</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Turn into</DropdownMenuLabel>
          <DropdownMenuItem icon={Pilcrow}>Text</DropdownMenuItem>
          <DropdownMenuItem icon={Heading1} shortcut="#">
            Heading 1
          </DropdownMenuItem>
          <DropdownMenuItem icon={Heading2} shortcut="##">
            Heading 2
          </DropdownMenuItem>
          <DropdownMenuItem icon={List} shortcut="-">
            Bulleted list
          </DropdownMenuItem>
          <DropdownMenuItem icon={Minus} shortcut="---">
            Divider
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

function SortMenu(props: { defaultOpen?: boolean }) {
  const [sort, setSort] = useState('due');
  const [showCompleted, setShowCompleted] = useState(true);
  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger
        render={<Button variant="outline" icon={ArrowDownUp} value="Due date" />}
      >
        Sort
      </DropdownMenuTrigger>
      <DropdownMenuContent width="sm">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(String(v))}>
            <DropdownMenuRadioItem value="due">Due date</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="created">Created</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={showCompleted} onCheckedChange={setShowCompleted}>
          Show completed
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Radio and checkbox items: the chosen ones are ticked. */
export const SortOptions: Story = {
  args: { defaultOpen: true },
  render: (args) => <SortMenu defaultOpen={args.defaultOpen} />,
};
