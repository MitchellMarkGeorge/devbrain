import { useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarDays, Repeat } from 'lucide-react';
import type { CalendarId } from '@common/ids';
import type { Calendar } from '@common/types';
import {
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EntityPill,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useFormat,
} from '@renderer/components';
import {
  REPEAT_LABELS,
  REPEAT_PRESETS,
  repeatPresetOf,
  repeatRule,
  repeatText,
} from '../lib/repeat';
import { dayText } from '../hooks/use-event-actions';

// The event's properties as pills that open their picker: the day, a time, how it repeats, its
// calendar. The Create event dialog and the event sheet share them.

/** The day as a pill ("Mon, Jun 22"), opening the date picker. */
export function DayPill({
  value,
  onChange,
  disabled,
  withGlyph = false,
}: {
  value: Date;
  onChange: (day: Date) => void;
  disabled?: boolean;
  /** the calendar glyph, as the sheet draws its rows */
  withGlyph?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { now } = useFormat();
  const pill = (
    <EntityPill interactive={!disabled} glyph={withGlyph ? CalendarDays : undefined}>
      {dayText(value)}
    </EntityPill>
  );
  if (disabled) return pill;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={pill} aria-label="Date" />
      <PopoverContent size="auto" align="start">
        <DatePicker
          value={value}
          today={now}
          defaultMonth={value}
          onChange={(day) => {
            if (day) onChange(day);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Every quarter hour of `day`, the times a time pill offers. */
export function quarterHours(day: Date): Date[] {
  const start = DateTime.fromJSDate(day).startOf('day');
  return Array.from({ length: 96 }, (_, i) => start.plus({ minutes: 15 * i }).toJSDate());
}

/** A time as a pill ("1:00 PM"), opening the day's quarter hours. */
export function TimePill({
  value,
  onChange,
  label,
  disabled,
}: {
  value: Date;
  onChange: (time: Date) => void;
  /** "Start time", "End time" */
  label: string;
  disabled?: boolean;
}) {
  const { formatTime } = useFormat();
  const pill = (
    <EntityPill interactive={!disabled} aria-label={`${label}: ${formatTime(value)}`}>
      {formatTime(value)}
    </EntityPill>
  );
  if (disabled) return pill;
  const times = quarterHours(value);
  // the value itself, when it's off the quarter hours
  if (!times.some((time) => time.getTime() === value.getTime())) times.push(value);
  times.sort((a, b) => a.getTime() - b.getTime());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={pill} />
      <DropdownMenuContent align="start" width="sm">
        <DropdownMenuRadioGroup
          value={String(value.getTime())}
          onValueChange={(next) => onChange(new Date(Number(next)))}
        >
          {times.map((time) => (
            <DropdownMenuRadioItem key={time.getTime()} value={String(time.getTime())}>
              {formatTime(time)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** How it repeats as a pill ("Every weekday"), opening the choices. */
export function RepeatPill({
  rule,
  start,
  onChange,
  disabled,
  withGlyph = false,
}: {
  rule: string | null;
  /** the series' first occurrence: a weekly rule repeats on its weekday */
  start: Date;
  onChange: (rule: string | null) => void;
  disabled?: boolean;
  withGlyph?: boolean;
}) {
  const preset = repeatPresetOf(rule, start);
  const pill = (
    <EntityPill interactive={!disabled} glyph={withGlyph ? Repeat : undefined} aria-label="Repeat">
      {repeatText(rule, start)}
    </EntityPill>
  );
  if (disabled) return pill;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={pill} />
      <DropdownMenuContent align="start" width="sm">
        <DropdownMenuRadioGroup
          value={preset}
          onValueChange={(next) => {
            if (next !== preset)
              onChange(repeatRule(next as (typeof REPEAT_PRESETS)[number], start));
          }}
        >
          {REPEAT_PRESETS.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {REPEAT_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The calendar as a pill (its colour bar and name), opening the calendars it can move to. */
export function CalendarPill({
  value,
  calendars,
  onChange,
  disabled,
}: {
  value: CalendarId;
  calendars: readonly Calendar[];
  onChange: (id: CalendarId) => void;
  disabled?: boolean;
}) {
  const calendar = calendars.find((c) => c.id === value);
  // events are written to local calendars only: a synced one's come from its provider
  const options = calendars.filter((c) => c.sourceId === null);
  const pill = (
    <EntityPill
      interactive={!disabled}
      aria-label="Calendar"
      entity={{
        type: 'event',
        title: calendar?.name ?? 'Calendar',
        color: calendar?.color ?? null,
      }}
    />
  );
  if (disabled || options.length < 2) return pill;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={pill} />
      <DropdownMenuContent align="start" width="sm">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as CalendarId)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
