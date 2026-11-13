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
  type SearchCounts,
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
  CommandStatus,
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
import { GROUP_LABELS, groupResults, nextFilter, withAll, type SearchFilter } from './results';
import { SearchHighlight } from './SearchHighlight';
import { useAtRest, type EntityItem } from './use-at-rest';
import styles from './SearchDialog.module.css';

/**
 * How long typing pauses before a search is asked for. Long enough that results change when the
 * user stops, not mid-word at a normal typing speed (a key every 150–250ms); a search itself
 * takes a few milliseconds.
 */
export const SEARCH_DEBOUNCE_MS = 300;
// the most results one search returns (the route's page limit); search.counts counts them all
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
  // a recent entity, or a type's latest while nothing is typed; `meta` is its right-hand text
  | { kind: 'entity'; key: string; item: EntityItem; meta: string }
  | { kind: 'command'; key: string; command: AppCommand; shortcut?: string };

interface ShownSearch {
  query: string;
  // the type it was searched for
  filter: SearchFilter;
  results: SearchResult[];
}

const NO_RESULTS: SearchResult[] = [];
const NO_COUNTS: SearchCounts = { task: 0, note: 0, project: 0, event: 0 };

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

  // the selected type's results (every type's for "All"), and how many of each type match
  const search = useQuery({
    ...trpc.search.search.queryOptions({
      query: searched,
      entityType: filter === 'all' ? [] : [filter],
      limit: SEARCH_LIMIT,
    }),
    enabled: searched !== '',
  });
  const countsQuery = useQuery({
    ...trpc.search.counts.queryOptions({ query: searched }),
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
  // The last search that finished, and what it found; and the last counts. While something is
  // typed, the dialog draws them (results or the no-results state, and the filter's counts) until
  // the next ones finish, so typing or switching the filter never blanks the list or flashes "No
  // results". They are kept when the box is emptied (which shows Recent and Go to), so typing
  // again shows them until the new search lands. A query search cannot read ("(") finds nothing
  // rather than failing.
  const [shown, setShown] = useState<ShownSearch | null>(null);
  const finished = search.isError ? NO_RESULTS : search.data;
  if (typed && finished && (shown?.results !== finished || shown.query !== searched)) {
    setShown({ query: searched, filter, results: finished });
  }
  const [shownCounts, setShownCounts] = useState<SearchCounts | null>(null);
  const counted = countsQuery.isError ? NO_COUNTS : countsQuery.data;
  if (typed && counted && shownCounts !== counted) setShownCounts(counted);
  const results = shown?.results ?? NO_RESULTS;

  // Recent and Go to (or a type filter's latest) while nothing is typed, and while the dialog's
  // first search runs
  const showEmptyQuery = !typed || shown === null;
  // the counts go with results, so none show beside Recent and Go to, even when search.counts
  // answers before the first search does
  const counts = !showEmptyQuery && shownCounts ? withAll(shownCounts) : undefined;
  // with a type filter, the type's latest instead of Recent and Go to
  const atRest = useAtRest(showEmptyQuery && filter !== 'all' ? filter : null);
  const groups = useMemo<Group[]>(() => {
    if (showEmptyQuery && filter !== 'all') {
      if (!atRest?.items.length) return [];
      return [
        {
          value: atRest.label,
          items: atRest.items.map(
            (item): Row => ({
              kind: 'entity',
              key: item.entity.id,
              item,
              meta:
                atRest.by === 'updated'
                  ? format.formatRelative(item.entity.updatedAt)
                  : entityMeta(item, format),
            }),
          ),
        },
      ];
    }
    if (showEmptyQuery) {
      const recent = (recents.data?.items ?? []).map(
        (item): Row => ({
          kind: 'entity',
          key: item.entity.id,
          item,
          meta: entityMeta(item, format),
        }),
      );
      return [
        ...(recent.length ? [{ value: 'Recent', count: recent.length, items: recent }] : []),
        ...(goTo.length ? [{ value: 'Go to', items: goTo }] : []),
      ];
    }
    return groupResults(results, filter, shownCounts).map(({ label, count, results: matches }) => ({
      value: label,
      count,
      items: matches.map((result): Row => ({ kind: 'result', key: result.entityId, result })),
    }));
  }, [showEmptyQuery, atRest, recents.data, goTo, results, filter, shownCounts, format]);

  const open = (row: Row) => {
    close();
    switch (row.kind) {
      case 'result':
        onOpenEntity({ id: row.result.entityId });
        break;
      case 'entity':
        onOpenEntity({
          id: row.item.entity.id,
          startAt: row.item.entityType === 'events' ? row.item.entity.startAt : undefined,
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

  // the selected type's own search found nothing (while another type's runs, the list waits)
  const noResults = typed && shown !== null && shown.filter === filter && results.length === 0;
  // a type filter with nothing typed, and none of that type to list
  const noneAtRest =
    showEmptyQuery && filter !== 'all' && atRest !== undefined && atRest.items.length === 0;

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
          <CommandStatus>
            {typed && shown?.filter === filter && results.length > 0
              ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
              : null}
          </CommandStatus>
          {noneAtRest && (
            <CommandEmpty>
              {filter === 'event'
                ? 'No events viewed yet'
                : `No ${GROUP_LABELS[filter].toLowerCase()} yet`}
            </CommandEmpty>
          )}
          {noResults && (
            <CommandEmpty>
              <EmptyState
                placement="inline"
                className={styles.empty}
                icon={Search}
                title={`No ${filter === 'all' ? 'results' : GROUP_LABELS[filter].toLowerCase()} for “${shown?.query}”`}
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
                  {(row: Row) => <SearchRow key={row.key} row={row} onOpen={open} />}
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

function SearchRow({ row, onOpen }: { row: Row; onOpen: (row: Row) => void }) {
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
    case 'entity': {
      const { item } = row;
      const { entity } = item;
      const status = item.entityType === 'tasks' ? item.entity.status : null;
      const color =
        item.entityType === 'projects' || item.entityType === 'events' ? item.entity.color : null;
      return (
        <CommandItem
          {...shared}
          variant="result"
          icon={entityIcon(TYPE_OF[item.entityType], status, color)}
          trailing={'external' in entity ? sourcePill(entity.external) : undefined}
          meta={row.meta}
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

const TYPE_OF: Record<EntityItem['entityType'], SearchEntityType> = {
  tasks: 'task',
  notes: 'note',
  projects: 'project',
  events: 'event',
};

const TYPE_NAMES: Record<EntityItem['entityType'], string> = {
  tasks: 'Task',
  notes: 'Note',
  projects: 'Project',
  events: 'Event',
};

// a recent row's right side: an event's day and time ("Today 10:30 AM"), else what it is
function entityMeta(item: EntityItem, format: Format): string {
  if (item.entityType !== 'events') return TYPE_NAMES[item.entityType];
  const { startAt, allDay } = item.entity;
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
  return (
    <SourcePill provider={providerOf(external)} interactive={false}>
      {external.key}
    </SourcePill>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
