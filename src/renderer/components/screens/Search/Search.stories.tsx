import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, CircleCheck, FileText, Folder } from 'lucide-react';
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandHint,
  CommandInput,
  CommandItem,
  CommandList,
  CommandMatch,
  CommandToolbar,
} from '../../ui/Command';
import { ColourBar } from '../../ui/ColourBar';
import { Icon } from '../../ui/Icon';
import { Kbd } from '../../ui/Kbd';
import { SourcePill } from '../../entities/SourcePill';
import { StatusIcon } from '../../entities/StatusIcon';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { TaskStatus } from '@common/types';
import { TasksPage } from '../Menus/TasksPage';

const meta = {
  title: 'Screens/Search',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface Result {
  value: string;
  title: string;
  icon: ReactNode;
  source?: string;
  snippet?: string;
  meta: string;
}
interface ResultGroup {
  value: string;
  items: Result[];
}

const task = (status: TaskStatus) => <StatusIcon status={status} />;

const RESULTS: ResultGroup[] = [
  {
    value: 'Tasks',
    items: [
      {
        value: 'eng-124',
        title: 'Implement OAuth2 PKCE flow',
        icon: task(TaskStatus.IN_PROGRESS),
        source: 'ENG-124',
        meta: 'Auth Overhaul',
      },
      {
        value: 'guide',
        title: 'Write PKCE migration guide',
        icon: task(TaskStatus.NOT_STARTED),
        meta: 'Auth Overhaul',
      },
      {
        value: 'eng-138',
        title: 'Add PKCE end-to-end tests',
        icon: task(TaskStatus.NOT_STARTED),
        source: 'ENG-138',
        meta: 'Auth Overhaul',
      },
    ],
  },
  {
    value: 'Notes',
    items: [
      {
        value: 'design-notes',
        title: 'PKCE design notes',
        icon: <Icon icon={FileText} />,
        snippet:
          '…S256 challenge, 96-character verifier and a 10-minute code TTL, behind a PKCE feature flag…',
        meta: '2h ago',
      },
      {
        value: 'adr',
        title: 'Architecture ADR #4 — PKCE',
        icon: <Icon icon={FileText} />,
        snippet: '…adopt PKCE for every public client and retire the implicit flow…',
        meta: 'Yesterday',
      },
    ],
  },
  {
    value: 'Projects',
    items: [
      {
        value: 'auth',
        title: 'Auth Overhaul',
        icon: <Icon icon={Folder} style={{ color: 'var(--swatch-blue)' }} />,
        snippet: '…moves every first-party client to the code flow with PKCE (S256)…',
        meta: 'Due Jul 1',
      },
    ],
  },
  {
    value: 'Events',
    items: [
      {
        value: 'review',
        title: 'Auth Overhaul Design Review',
        icon: (
          <span style={{ display: 'grid', placeItems: 'center', width: 16 }}>
            <ColourBar color="blue" height={14} />
          </span>
        ),
        snippet: '…walk through the PKCE rollout plan…',
        meta: 'Tue 2:00 PM',
      },
    ],
  },
];

// the figures Figma shows: one more note than listed
const COUNTS: Record<string, number> = { Tasks: 3, Notes: 3, Projects: 1, Events: 2 };

function SearchPalette({ query: initial, groups }: { query: string; groups: ResultGroup[] }) {
  const [query, setQuery] = useState(initial);
  const [type, setType] = useState('all');
  const counts = groups.length ? COUNTS : { Tasks: 0, Notes: 0, Projects: 0, Events: 0 };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <CommandDialog open modal={false}>
      <Command
        bare
        items={groups}
        filter={null}
        value={query}
        onValueChange={(next: string) => setQuery(next)}
      >
        <CommandInput
          placeholder="Search tasks, notes, projects and events…"
          trailing={<Kbd variant="raised">Esc</Kbd>}
        />
        <CommandToolbar>
          <ToggleGroup
            variant="outline"
            aria-label="Result type"
            value={type}
            onValueChange={setType}
            items={[
              { value: 'all', label: 'All', count: total },
              { value: 'tasks', label: 'Tasks', icon: CircleCheck, count: counts.Tasks },
              { value: 'notes', label: 'Notes', icon: FileText, count: counts.Notes },
              { value: 'projects', label: 'Projects', icon: Folder, count: counts.Projects },
              { value: 'events', label: 'Events', icon: Calendar, count: counts.Events },
            ]}
          />
        </CommandToolbar>
        <CommandEmpty>No results for “{query}”</CommandEmpty>
        <CommandList>
          {(group: ResultGroup) => (
            <CommandGroup
              key={group.value}
              items={group.items}
              label={group.value}
              count={COUNTS[group.value]}
            >
              <CommandCollection>
                {(item: Result) => (
                  <CommandItem
                    key={item.value}
                    value={item}
                    variant="result"
                    icon={item.icon}
                    trailing={item.source && <SourcePill>{item.source}</SourcePill>}
                    description={item.snippet && <CommandMatch text={item.snippet} query={query} />}
                    meta={item.meta}
                  >
                    <CommandMatch text={item.title} query={query} />
                  </CommandItem>
                )}
              </CommandCollection>
            </CommandGroup>
          )}
        </CommandList>
        <CommandFooter>
          <CommandHint keys="↑↓">Navigate</CommandHint>
          <CommandHint keys="↵">Open</CommandHint>
          <CommandHint keys="Tab">Change filter</CommandHint>
        </CommandFooter>
      </Command>
    </CommandDialog>
  );
}

/** Figma "Search — results" (7170:15331): "pkce" over the Tasks list, the first result highlighted. */
export const Results: Story = {
  name: 'Search — results',
  render: () => (
    <TasksPage>
      <SearchPalette query="pkce" groups={RESULTS} />
    </TasksPage>
  ),
};

/** Figma "Search — no results" (7170:15656). */
export const NoResults: Story = {
  name: 'Search — no results',
  render: () => (
    <TasksPage>
      <SearchPalette query="oauth3" groups={[]} />
    </TasksPage>
  ),
};
