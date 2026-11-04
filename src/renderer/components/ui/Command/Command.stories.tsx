import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CalendarDays,
  CircleCheck,
  FileText,
  Folder,
  Heading1,
  Heading2,
  Home,
  Image,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../Button';
import { ToggleGroup } from '../ToggleGroup';
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandToolbar,
} from './Command';

interface Item {
  value: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}
interface Group {
  value: string;
  items: Item[];
  /** show a result count beside the label */
  counted?: boolean;
}

const meta = {
  title: 'Components/Command',
  component: Command,
  decorators: [
    (Story) => (
      <div style={{ minHeight: 440 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

function Results({ onPick }: { onPick?: () => void }) {
  return (
    <>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList>
        {(group: Group) => (
          <CommandGroup
            key={group.value}
            items={group.items}
            label={group.value}
            count={group.counted ? group.items.length : undefined}
          >
            <CommandCollection>
              {(item: Item) => (
                <CommandItem
                  key={item.value}
                  value={item}
                  icon={item.icon}
                  shortcut={item.shortcut}
                  onClick={onPick}
                >
                  {item.label}
                </CommandItem>
              )}
            </CommandCollection>
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
}

const slashGroups: Group[] = [
  {
    value: 'Basic blocks',
    items: [
      { value: 'text', label: 'Text', icon: Pilcrow },
      { value: 'h1', label: 'Heading 1', icon: Heading1, shortcut: '#' },
      { value: 'h2', label: 'Heading 2', icon: Heading2, shortcut: '##' },
      { value: 'quote', label: 'Quote', icon: Quote, shortcut: '>' },
    ],
  },
  {
    value: 'List blocks',
    items: [
      { value: 'bullets', label: 'Bulleted list', icon: List, shortcut: '-' },
      { value: 'numbers', label: 'Numbered list', icon: ListOrdered, shortcut: '1.' },
      { value: 'todo', label: 'To-do list', icon: ListChecks, shortcut: '[]' },
    ],
  },
  {
    value: 'Media',
    items: [{ value: 'image', label: 'Image', icon: Image }],
  },
  {
    value: 'Others',
    items: [{ value: 'divider', label: 'Divider', icon: Minus, shortcut: '---' }],
  },
];

/** The editor's slash menu: an inline Command. */
export const SlashMenu: Story = {
  args: { items: slashGroups },
  render: (args) => (
    <Command {...args} items={slashGroups}>
      <CommandInput placeholder="Search blocks…" />
      <Results />
    </Command>
  ),
};

const searchGroups: Group[] = [
  {
    value: 'Tasks',
    counted: true,
    items: [
      { value: 't1', label: 'Ship the onboarding flow', icon: CircleCheck },
      { value: 't2', label: 'Review calendar sync PR', icon: CircleCheck },
      { value: 't3', label: 'Write the Q3 roadmap', icon: CircleCheck },
    ],
  },
  {
    value: 'Notes',
    counted: true,
    items: [{ value: 'n1', label: 'Q3 planning notes', icon: FileText }],
  },
  {
    value: 'Projects',
    counted: true,
    items: [{ value: 'p1', label: 'DevBrain app', icon: Folder }],
  },
  {
    value: 'Go to',
    items: [
      { value: 'home', label: 'Home', icon: Home, shortcut: 'G H' },
      { value: 'calendar', label: 'Calendar', icon: CalendarDays, shortcut: 'G C' },
      { value: 'settings', label: 'Settings', icon: Settings, shortcut: '⌘,' },
    ],
  },
];

// the type filter: ToggleGroup's outline variant, each type with its icon and result count
function TypeFilter() {
  const [type, setType] = useState('all');
  return (
    <CommandToolbar>
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label="Result type"
        value={type}
        onValueChange={setType}
        items={[
          { value: 'all', label: 'All' },
          { value: 'tasks', label: 'Tasks', icon: CircleCheck, count: 3 },
          { value: 'notes', label: 'Notes', icon: FileText, count: 1 },
          { value: 'projects', label: 'Projects', icon: Folder, count: 1 },
          { value: 'events', label: 'Events', icon: CalendarDays, count: 0 },
        ]}
      />
    </CommandToolbar>
  );
}

function SearchPalette({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <>
      <Button icon={Search} value="⌘K" onClick={() => setOpen(true)}>
        Search
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command bare items={searchGroups}>
          <CommandInput placeholder="Search tasks, notes, projects and events…" />
          <TypeFilter />
          <Results onPick={() => setOpen(false)} />
        </Command>
      </CommandDialog>
    </>
  );
}

/** ⌘K search: the search row, the type filter, then result groups with counts. */
export const SearchDialog: Story = {
  args: { items: searchGroups },
  render: () => <SearchPalette />,
};

export const SearchDialogOpen: Story = {
  args: { items: searchGroups },
  render: () => <SearchPalette defaultOpen />,
};
