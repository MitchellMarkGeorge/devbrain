import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  CircleCheck,
  FileText,
  Folder,
  House,
  Plus,
  Search,
  Settings,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  TaskStatus,
  type ExternalRef,
  type RecentEntity,
  type SearchEntityType,
  type SearchResult,
} from '@common/types';
import {
  Button,
  ColourBar,
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
  CommandToolbar,
  EmptyState,
  Icon,
  Kbd,
  providerOf,
  resolveColor,
  SourcePill,
  StatusIcon,
  ToggleGroup,
  useFormat,
  type Format,
} from '../../components';
import { trpc } from '../../ipc';
import {
  commandShortcut,
  KeyScope,
  useCommandList,
  useKeyboard,
  useKeyboardState,
  useRunCommand,
  type Command as AppCommand,
} from '../../keyboard';
import type { ModalProps } from '../../modals';
import type { EntityRef } from '../app/entities';
import { countResults, groupResults, nextFilter, type SearchFilter } from './results';
import { SearchHighlight } from './SearchHighlight';
import styles from './SearchDialog.module.css';

/** How long typing settles before a search is asked for. */
export const SEARCH_DEBOUNCE_MS = 150;
// the most results one search returns (the route's page limit): the counts are of these
const SEARCH_LIMIT = 200;
const RECENT_LIMIT = 5;

// "Go to" lists the commands that go to a page, `nav.<page>`, with these icons
const PAGE_ICONS: Record<string, LucideIcon> = {
  'nav.home': House,
  'nav.tasks': CircleCheck,
  'nav.projects': Folder,
  'nav.notes': FileText,
  'nav.calendar': Calendar,
  'nav.integrations': Zap,
  'nav.settings': Settings,
  'nav.trash': Trash2,
};
const NEW_NOTE = 'note.new';

type Row =
  | { kind: 'result'; key: string; result: SearchResult }
  | { kind: 'recent'; key: string; recent: RecentEntity }
  | { kind: 'command'; key: string; command: AppCommand; shortcut?: string };

interface ShownSearch {
  query: string;
  results: SearchResult[];
}

const NO_RESULTS: SearchResult[] = [];

interface Group {
  value: string;
  count?: number;
  items: Row[];
}

export interface SearchDialogProps extends ModalProps {
  /** opens a result or a recent entity where it lives (`useOpenEntity`) */
  onOpenEntity: (entity: EntityRef) => void;
  /** the no-results state's "New Task": Create task with what was searched as its title */
  onNewTask?: (title: string) => void;
}

/**
 * ⌘K search (Figma `7170:14844`): `search.search` as the user types, debounced, grouped by type
 * with the type filter (Tab and ⇧Tab switch it); "Recent" and "Go to" while nothing is typed; and
 * New Task / New Note when nothing matches. ↑↓ move, ↵ opens. Shown with `useOpenSearch`.
 */
export function SearchDialog({ onOpenEntity, onNewTask, ...props }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const searched = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const format = useFormat('minute');
  const runCommand = useRunCommand();
  const close = () => props.onOpenChange(false);

  const search = useQuery({
    ...trpc.search.search.queryOptions({ query: searched, limit: SEARCH_LIMIT }),
    enabled: searched !== '',
  });
  const recents = useQuery({
    ...trpc.recents.list.queryOptions({ limit: RECENT_LIMIT }),
    enabled: query.trim() === '',
  });
  const goTo = useGoToRows();
  const commands = useCommandList();
  const canNewNote = commands.some(({ id }) => id === NEW_NOTE);

  const typed = query.trim() !== '';
  // The last search that finished, and what it found. The dialog draws it (results or the
  // no-results state, and the filter's counts) until the next search finishes, so typing never
  // blanks the list or flashes "No results" between keystrokes. A query search cannot read ("(")
  // finds nothing rather than failing the dialog.
  const [shown, setShown] = useState<ShownSearch | null>(null);
  const finished = search.isError ? NO_RESULTS : search.data;
  if (!typed && shown !== null) setShown(null);
  if (typed && finished && (shown?.query !== searched || shown.results !== finished)) {
    setShown({ query: searched, results: finished });
  }
  const results = shown?.results ?? NO_RESULTS;
  const counts = shown && countResults(results);

  const groups = useMemo<Group[]>(() => {
    if (!typed) {
      const recent = (recents.data?.items ?? []).map(
        (item): Row => ({ kind: 'recent', key: item.entity.id, recent: item }),
      );
      return [
        ...(recent.length ? [{ value: 'Recent', count: recent.length, items: recent }] : []),
        ...(goTo.length ? [{ value: 'Go to', items: goTo }] : []),
      ];
    }
    return groupResults(results, filter).map(({ label, count, results: matches }) => ({
      value: label,
      count,
      items: matches.map((result): Row => ({ kind: 'result', key: result.entityId, result })),
    }));
  }, [typed, recents.data, goTo, results, filter]);

  const open = (row: Row) => {
    close();
    switch (row.kind) {
      case 'result':
        onOpenEntity({ id: row.result.entityId });
        break;
      case 'recent':
        onOpenEntity({
          id: row.recent.entity.id,
          startAt: row.recent.entityType === 'events' ? row.recent.entity.startAt : undefined,
        });
        break;
      case 'command':
        runCommand(row.command.id);
        break;
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    setFilter((current) => nextFilter(current, event.shiftKey ? -1 : 1));
  };

  const noResults = typed && shown !== null && results.length === 0;

  return (
    <CommandDialog {...props}>
      <KeyScope name="dialog">
        <Command
          bare
          items={groups}
          filter={null}
          value={query}
          onValueChange={(next: string, details) => {
            if (details.reason !== 'item-press') setQuery(next);
          }}
        >
          <CommandInput
            placeholder="Search tasks, notes, projects and events…"
            aria-label="Search"
            onKeyDown={onInputKeyDown}
            trailing={<Kbd variant="raised">Esc</Kbd>}
          />
          <CommandToolbar>
            <ToggleGroup
              variant="outline"
              aria-label="Result type"
              value={filter}
              onValueChange={(value: string) => setFilter(value as SearchFilter)}
              items={[
                { value: 'all', label: 'All', count: counts?.all },
                filterItem('task', 'Tasks', CircleCheck, counts?.task),
                filterItem('note', 'Notes', FileText, counts?.note),
                filterItem('project', 'Projects', Folder, counts?.project),
                filterItem('event', 'Events', Calendar, counts?.event),
              ]}
            />
          </CommandToolbar>
          {noResults && (
            <CommandEmpty>
              <EmptyState
                placement="inline"
                className={styles.empty}
                icon={Search}
                title={`No results for “${shown?.query}”`}
                description="Try fewer words, or check the spelling. Items in the trash aren’t searched."
                action={
                  (onNewTask || canNewNote) && (
                    <span className={styles.actions}>
                      {onNewTask && (
                        <Button
                          size="sm"
                          icon={Plus}
                          onClick={() => {
                            close();
                            onNewTask(shown?.query ?? '');
                          }}
                        >
                          New Task “{shown?.query}”
                        </Button>
                      )}
                      {canNewNote && (
                        <Button
                          size="sm"
                          icon={FileText}
                          onClick={() => {
                            close();
                            runCommand(NEW_NOTE);
                          }}
                        >
                          New Note
                        </Button>
                      )}
                    </span>
                  )
                }
              />
            </CommandEmpty>
          )}
          <CommandList>
            {(group: Group) => (
              <CommandGroup
                key={group.value}
                items={group.items}
                label={group.value}
                count={group.count}
              >
                <CommandCollection>
                  {(row: Row) => (
                    <SearchRow key={row.key} row={row} format={format} onOpen={open} />
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
      </KeyScope>
    </CommandDialog>
  );
}

// a filter item, with its count once a search has finished
function filterItem(
  value: SearchEntityType,
  label: string,
  icon: LucideIcon,
  count: number | undefined,
) {
  return { value, label, icon, count };
}

/** The registry's "go to a page" commands, with the keys the keymap binds them to. */
function useGoToRows(): Row[] {
  const commands = useCommandList();
  const { keymap, platform } = useKeyboard();
  const { mode } = useKeyboardState();
  return useMemo(
    () =>
      commands
        .filter(({ id }) => id in PAGE_ICONS)
        .map((command) => ({
          kind: 'command' as const,
          key: command.id,
          command,
          shortcut: commandShortcut(keymap, command.id, mode, platform),
        })),
    [commands, keymap, mode, platform],
  );
}

function SearchRow({
  row,
  format,
  onOpen,
}: {
  row: Row;
  format: Format;
  onOpen: (row: Row) => void;
}) {
  const shared = { value: row, onClick: () => onOpen(row) };
  switch (row.kind) {
    case 'result': {
      const { result } = row;
      return (
        <CommandItem
          {...shared}
          variant="result"
          icon={entityIcon(result.entityType, result.status, result.color)}
          trailing={sourcePill(result.external)}
          description={result.body ? <SearchHighlight html={result.body} /> : undefined}
        >
          <SearchHighlight html={result.title} />
        </CommandItem>
      );
    }
    case 'recent': {
      const { recent } = row;
      const { entity } = recent;
      const status = recent.entityType === 'tasks' ? recent.entity.status : null;
      const color =
        recent.entityType === 'projects' || recent.entityType === 'events'
          ? recent.entity.color
          : null;
      return (
        <CommandItem
          {...shared}
          variant="result"
          icon={entityIcon(TYPE_OF[recent.entityType], status, color)}
          trailing={'external' in entity ? sourcePill(entity.external) : undefined}
          meta={recentMeta(recent, format)}
        >
          {entity.title || 'Untitled'}
        </CommandItem>
      );
    }
    case 'command':
      return (
        <CommandItem {...shared} icon={PAGE_ICONS[row.command.id]} shortcut={row.shortcut}>
          {row.command.title.replace(/^Go to /, '')}
        </CommandItem>
      );
  }
}

const TYPE_OF: Record<RecentEntity['entityType'], SearchEntityType> = {
  tasks: 'task',
  notes: 'note',
  projects: 'project',
  events: 'event',
};

const TYPE_NAMES: Record<RecentEntity['entityType'], string> = {
  tasks: 'Task',
  notes: 'Note',
  projects: 'Project',
  events: 'Event',
};

// a recent row's right side: an event's day and time ("Today 10:30 AM"), else what it is
function recentMeta(recent: RecentEntity, format: Format): string {
  if (recent.entityType !== 'events') return TYPE_NAMES[recent.entityType];
  const { startAt, allDay } = recent.entity;
  return allDay
    ? format.formatDue(startAt)
    : `${format.formatDue(startAt)} ${format.formatTime(startAt)}`;
}

/**
 * An entity's glyph: a task's status, a note's page, a project's folder in its colour, an event's
 * bar in its colour. Colours from core are untrusted; resolveColor parses them as #rrggbb.
 */
function entityIcon(
  type: SearchEntityType,
  status: TaskStatus | null,
  color: string | null,
): ReactNode {
  switch (type) {
    case 'task':
      return <StatusIcon status={status ?? TaskStatus.NOT_STARTED} />;
    case 'note':
      return <Icon icon={FileText} />;
    case 'project':
      return <Icon icon={Folder} style={{ color: resolveColor(color, 'blue') }} />;
    case 'event':
      return (
        <span className={styles.bar}>
          <ColourBar color={resolveColor(color, 'blue')} height={14} />
        </span>
      );
  }
}

// a synced item's key ("ENG-124") as its source pill; none for a local one or one with no key
function sourcePill(external: ExternalRef | null | undefined): ReactNode {
  if (!external?.key) return undefined;
  return <SourcePill provider={providerOf(external)}>{external.key}</SourcePill>;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
