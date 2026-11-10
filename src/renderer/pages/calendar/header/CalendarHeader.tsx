import { Fragment } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ListFilter, Plus } from 'lucide-react';
import type { Calendar } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ToggleGroup,
  useWorkspaceShell,
} from '../../../components';
import { trpc } from '../../../ipc';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { monthTitle } from '../range';
import type { CalendarViewParam } from '../search';
import styles from './CalendarHeader.module.css';

const VIEW_ITEMS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

const STEP_LABELS: Record<CalendarViewParam, [string, string]> = {
  month: ['Previous month', 'Next month'],
  week: ['Previous week', 'Next week'],
  day: ['Previous day', 'Next day'],
};

/** The header's place: the month shown, and the calendar filter. */
export function CalendarHeaderStart({
  date,
  calendars,
  narrow = false,
}: {
  date: Date;
  calendars: readonly Calendar[];
  /** less room (a sheet is open, or the window isn't wide): "Jun 2026", and Filter without its value */
  narrow?: boolean;
}) {
  return (
    <div className={styles.start}>
      <h1 className={styles.title}>{monthTitle(date, narrow ? 'short' : 'long')}</h1>
      <CalendarFilterMenu calendars={calendars} hideValue={narrow} />
    </div>
  );
}

/** The header's actions: the view, ‹ Today ›, New Event. */
export function CalendarHeaderEnd({
  view,
  onViewChange,
  onStep,
  onToday,
  onNewEvent,
}: {
  view: CalendarViewParam;
  onViewChange: (view: CalendarViewParam) => void;
  onStep: (direction: -1 | 1) => void;
  onToday: () => void;
  onNewEvent: () => void;
}) {
  const [previous, next] = STEP_LABELS[view];
  return (
    <div className={styles.end}>
      <ToggleGroup
        aria-label="View"
        value={view}
        items={VIEW_ITEMS}
        onValueChange={(value) => onViewChange(value as CalendarViewParam)}
      />
      <div className={styles.stepper}>
        <Button
          variant="ghost"
          size="icon"
          icon={ChevronLeft}
          aria-label={previous}
          onClick={() => onStep(-1)}
        />
        <Button variant="outline" onClick={onToday}>
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon"
          icon={ChevronRight}
          aria-label={next}
          onClick={() => onStep(1)}
        />
      </div>
      <Button variant="outline" icon={Plus} onClick={onNewEvent}>
        New Event
      </Button>
    </div>
  );
}

/** The Filter button's value: which calendars show. */
export function filterValue(calendars: readonly Calendar[]): string {
  const shown = calendars.filter((calendar) => calendar.visible);
  if (shown.length === calendars.length) return 'All calendars';
  if (shown.length === 0) return 'None';
  if (shown.length === 1) return shown[0].name;
  return `${shown.length} calendars`;
}

/** The calendars the menu lists, grouped: the local ones, then each synced account's. */
export function filterGroups(calendars: readonly Calendar[]): Calendar[][] {
  const local = calendars.filter((calendar) => calendar.sourceId === null);
  const bySource = new Map<string, Calendar[]>();
  for (const calendar of calendars) {
    // an unticked synced calendar isn't synced at all: Choose Calendars brings it back
    if (calendar.sourceId === null || !calendar.selected) continue;
    bySource.set(calendar.sourceId, [...(bySource.get(calendar.sourceId) ?? []), calendar]);
  }
  return [local, ...bySource.values()].filter((group) => group.length > 0);
}

/**
 * "Filter: All calendars" (Figma `7424:42573`): every calendar with a tick while it shows, by
 * where it comes from ("On this Mac", "Google · mitchell@acme.com"), then Show all. Core keeps
 * each calendar's visibility (`calendars.setVisible`), not the URL.
 */
export function CalendarFilterMenu({
  calendars,
  hideValue = false,
}: {
  calendars: readonly Calendar[];
  hideValue?: boolean;
}) {
  const { size } = useWorkspaceShell();
  const integrations = useQuery(trpc.integrations.list.queryOptions()).data;
  const showError = useMutationErrorToast('Couldn’t change the calendars shown');
  const setVisible = useMutation(
    trpc.calendars.setVisible.mutationOptions({ onError: (e) => showError(e) }),
  );
  const groups = filterGroups(calendars);
  const listed = groups.flat();
  const accountOf = (calendar: Calendar) =>
    integrations?.find((integration) =>
      integration.sources.some((source) => source.id === calendar.sourceId),
    )?.accountLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            icon={ListFilter}
            value={filterValue(listed)}
            hideValue={hideValue || size === 'compact'}
          >
            Filter
          </Button>
        }
      />
      <DropdownMenuContent align="start" width="sm" data-testid="calendar-filter">
        {groups.map((group, index) => {
          const account = group[0].sourceId === null ? null : accountOf(group[0]);
          return (
            <Fragment key={group[0].sourceId ?? 'local'}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {group[0].sourceId === null
                    ? 'On this Mac'
                    : account
                      ? `Google · ${account}`
                      : 'Google Calendar'}
                </DropdownMenuLabel>
                {group.map((calendar) => (
                  <DropdownMenuCheckboxItem
                    key={calendar.id}
                    checked={calendar.visible}
                    closeOnClick={false}
                    onCheckedChange={(visible) => setVisible.mutate({ id: calendar.id, visible })}
                  >
                    {calendar.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </Fragment>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={listed.every((calendar) => calendar.visible)}
          onClick={() => {
            for (const calendar of listed) {
              if (!calendar.visible) setVisible.mutate({ id: calendar.id, visible: true });
            }
          }}
        >
          Show all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
