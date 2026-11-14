import { forwardRef, Fragment } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Plus,
} from 'lucide-react';
import type { Calendar } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ToggleGroup,
  useWorkspaceShell,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { monthTitle } from '../../lib/range';
import type { CalendarViewParam } from '../../api/search';
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

/**
 * How much of the header fits its width, from the most to the least:
 *
 * - `full`: "November 2026", Filter with its value, the view switch, ‹ Today ›, "+ New Event";
 * - `short`: "Nov 2026", and Filter without its value;
 * - `compact`: Filter as its icon alone (Figma `7410:34948`, with a sheet open), New Event as "+";
 * - `tiny`: the view switch as a menu ("Day ⌄"), and Today as an icon.
 *
 * Each step frees room before the header's two sides would meet; the title is never cut.
 */
export type CalendarHeaderLayout = 'full' | 'short' | 'compact' | 'tiny';

/** The layout for a header `width` pixels wide (its 24px sides included). */
export function headerLayout(width: number): CalendarHeaderLayout {
  if (width >= 900) return 'full';
  if (width >= 740) return 'short';
  if (width >= 600) return 'compact';
  return 'tiny';
}

/** The header's place: the month shown, and the calendar filter. */
export const CalendarHeaderStart = forwardRef<
  HTMLDivElement,
  { date: Date; calendars: readonly Calendar[]; layout?: CalendarHeaderLayout }
>(function CalendarHeaderStart({ date, calendars, layout = 'full' }, ref) {
  return (
    <div ref={ref} className={styles.start}>
      <h1 className={styles.title}>{monthTitle(date, layout === 'full' ? 'long' : 'short')}</h1>
      <CalendarFilterMenu
        calendars={calendars}
        display={layout === 'full' ? 'value' : layout === 'short' ? 'label' : 'icon'}
      />
    </div>
  );
});

/** The header's actions: the view, ‹ Today ›, New Event. */
export function CalendarHeaderEnd({
  view,
  layout = 'full',
  onViewChange,
  onStep,
  onToday,
  onNewEvent,
}: {
  view: CalendarViewParam;
  layout?: CalendarHeaderLayout;
  onViewChange: (view: CalendarViewParam) => void;
  onStep: (direction: -1 | 1) => void;
  onToday: () => void;
  onNewEvent: () => void;
}) {
  const [previous, next] = STEP_LABELS[view];
  const tiny = layout === 'tiny';
  const iconNewEvent = layout === 'compact' || tiny;
  return (
    <div className={styles.end}>
      {tiny ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" trailingIcon={ChevronDown} aria-label="View">
                {VIEW_ITEMS.find((item) => item.value === view)?.label}
              </Button>
            }
          />
          <DropdownMenuContent align="end" width="sm">
            <DropdownMenuRadioGroup
              value={view}
              onValueChange={(value) => onViewChange(value as CalendarViewParam)}
            >
              {VIEW_ITEMS.map((item) => (
                <DropdownMenuRadioItem key={item.value} value={item.value}>
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <ToggleGroup
          aria-label="View"
          value={view}
          items={VIEW_ITEMS}
          onValueChange={(value) => onViewChange(value as CalendarViewParam)}
        />
      )}
      <div className={styles.stepper}>
        <Button
          variant="ghost"
          size="icon"
          icon={ChevronLeft}
          aria-label={previous}
          onClick={() => onStep(-1)}
        />
        {tiny ? (
          <Button
            variant="outline"
            size="icon"
            icon={CalendarCheck}
            aria-label="Today"
            onClick={onToday}
          />
        ) : (
          <Button variant="outline" onClick={onToday}>
            Today
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          icon={ChevronRight}
          aria-label={next}
          onClick={() => onStep(1)}
        />
      </div>
      {iconNewEvent ? (
        <Button
          variant="outline"
          size="icon"
          icon={Plus}
          aria-label="New Event"
          onClick={onNewEvent}
        />
      ) : (
        <Button variant="outline" icon={Plus} onClick={onNewEvent}>
          New Event
        </Button>
      )}
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
  display = 'value',
}: {
  calendars: readonly Calendar[];
  /** "Filter All calendars", "Filter", or the icon alone */
  display?: 'value' | 'label' | 'icon';
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
          display === 'icon' ? (
            <Button
              variant="outline"
              size="icon"
              icon={ListFilter}
              aria-label={`Filter: ${filterValue(listed)}`}
            />
          ) : (
            <Button
              variant="outline"
              icon={ListFilter}
              value={filterValue(listed)}
              hideValue={display === 'label' || size === 'compact'}
            >
              Filter
            </Button>
          )
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
