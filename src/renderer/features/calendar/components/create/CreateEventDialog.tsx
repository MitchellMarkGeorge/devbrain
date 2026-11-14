import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import {
  ArrowRight,
  Calendar as CalendarGlyph,
  Clock,
  FileText,
  MapPin,
  Repeat,
  Video,
} from 'lucide-react';
import type { CalendarId } from '@common/ids';
import { safeExternalUrl } from '@common/safe-url';
import type { AppSettings, Calendar, Event } from '@common/types';
import {
  Button,
  CreateDialogBody,
  CreateDialogContent,
  CreateDialogField,
  CreateDialogFieldList,
  CreateDialogFooter,
  CreateDialogTitleInput,
  Dialog,
  DialogClose,
  Icon,
  Input,
  Switch,
  Textarea,
  toast,
} from '@renderer/components';
import { ipc, trpc } from '@renderer/ipc';
import { KeyScope } from '@renderer/keyboard';
import type { ModalProps } from '@renderer/app/modals';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { CalendarPill, DayPill, RepeatPill, TimePill } from '../pickers';

/** Where the dialog opens: a slot selected on the grid, or New Event's next hour. */
export interface EventDraftRange {
  start: Date;
  /** exclusive; for an all-day draft the midnight after its last day */
  end: Date;
  allDay: boolean;
}

const DURATION_MINUTES: Record<AppSettings['calendar']['defaultEventDuration'], number> = {
  '15m': 15,
  '30m': 30,
  '1h': 60,
};

/** The setting's default event length, in minutes. */
export function defaultDurationMinutes(
  settings: Pick<AppSettings, 'calendar'> | undefined,
): number {
  return DURATION_MINUTES[settings?.calendar.defaultEventDuration ?? '1h'];
}

/**
 * The range a selection on the grid gives the dialog: a drag keeps its range; a click (one 15
 * minute slot) lasts the default event length; an all-day or month click is that day.
 */
export function draftFromSelection(
  selection: EventDraftRange,
  durationMinutes: number,
): EventDraftRange {
  const length = selection.end.getTime() - selection.start.getTime();
  if (!selection.allDay && length <= 15 * 60_000) {
    return {
      start: selection.start,
      end: new Date(selection.start.getTime() + durationMinutes * 60_000),
      allDay: false,
    };
  }
  return selection;
}

/**
 * New Event's draft on `day`: from the next hour when it's today, else 9:00, lasting the default
 * event length.
 */
export function draftForDay(day: Date, now: Date, durationMinutes: number): EventDraftRange {
  const date = DateTime.fromJSDate(day).startOf('day');
  const today = DateTime.fromJSDate(now);
  const start = date.hasSame(today, 'day')
    ? today.startOf('hour').plus({ hours: 1 })
    : date.set({ hour: 9 });
  return {
    start: start.toJSDate(),
    end: start.plus({ minutes: durationMinutes }).toJSDate(),
    allDay: false,
  };
}

/** The calendar a new event goes on: the first local one, the default calendar when it's first. */
export function defaultCalendar(calendars: readonly Calendar[]): Calendar | undefined {
  const local = calendars.filter((calendar) => calendar.sourceId === null);
  return local.find((calendar) => calendar.visible) ?? local[0];
}

/** A typed meeting link as a URL core can open: `meet.example.com/x` gets https. */
export function meetingUrlOf(text: string): string | undefined | null {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return safeExternalUrl(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
}

export interface CreateEventDialogProps extends ModalProps {
  range: EventDraftRange;
  /** the event was created: "Open" in its toast */
  onOpenEvent?: (event: Event) => void;
}

/**
 * New event (Figma `7175:42495`): the title, then a field per property: when (the day, start →
 * end, All day), repeat, calendar, location, meeting link and description. Opened from New Event
 * and from a slot selected on the grid. ⌘↵ or Enter in the title creates it.
 */
export function CreateEventDialog({ range, onOpenEvent, ...modal }: CreateEventDialogProps) {
  const calendars = useQuery(trpc.calendars.list.queryOptions()).data ?? [];
  const showError = useMutationErrorToast('Couldn’t create the event');
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const [allDay, setAllDay] = useState(range.allDay);
  const [rule, setRule] = useState<string | null>(null);
  const [calendarId, setCalendarId] = useState<CalendarId | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [meeting, setMeeting] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const calendar = calendarId ?? defaultCalendar(calendars)?.id;
  const meetingUrl = meetingUrlOf(meeting);
  const validTimes = allDay || end.getTime() > start.getTime();
  const canCreate = title.trim().length > 0 && !saving && meetingUrl !== null && validTimes;

  // the day moves both ends; a new start keeps the length
  const moveDay = (day: Date) => {
    const shift = DateTime.fromJSDate(day)
      .startOf('day')
      .diff(DateTime.fromJSDate(start).startOf('day'), 'days').days;
    setStart(
      DateTime.fromJSDate(start)
        .plus({ days: Math.round(shift) })
        .toJSDate(),
    );
    setEnd(
      DateTime.fromJSDate(end)
        .plus({ days: Math.round(shift) })
        .toJSDate(),
    );
  };
  const moveStart = (time: Date) => {
    setEnd(new Date(time.getTime() + (end.getTime() - start.getTime())));
    setStart(time);
  };

  async function create() {
    if (!canCreate) return;
    setSaving(true);
    const day = DateTime.fromJSDate(start).startOf('day');
    // an all-day event lasts to the midnight after its last day, a day at least
    const lastDay = DateTime.fromJSDate(end).startOf('day');
    const endDay = lastDay > day ? lastDay : day.plus({ days: 1 });
    const timing = allDay
      ? {
          startAt: day.toJSDate(),
          endAt: endDay.toJSDate(),
          allDay: true,
          startDate: day.toISODate()!,
          endDate: endDay.toISODate()!,
        }
      : { startAt: start, endAt: end, allDay: false };
    try {
      const event = await ipc.events.create.mutate({
        title: title.trim(),
        ...timing,
        ...(rule && { recurrenceRule: rule }),
        ...(calendar && { calendarId: calendar }),
        ...(location.trim() && { location: location.trim() }),
        ...(meetingUrl && { meetingUrl }),
        ...(description.trim() && { description: description.trim() }),
      });
      toast({
        tone: 'success',
        title: 'Event created',
        description: event.title,
        action: onOpenEvent && { label: 'Open', onClick: () => onOpenEvent(event) },
      });
      modal.onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void create();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void create();
    }
  }

  return (
    <Dialog {...modal}>
      <CreateDialogContent
        size="event"
        aria-label="New event"
        initialFocus={titleRef}
        onKeyDown={onKeyDown}
        data-testid="create-event"
      >
        <KeyScope name="dialog">
          <form onSubmit={onSubmit}>
            <CreateDialogBody>
              <CreateDialogTitleInput
                ref={titleRef}
                placeholder="Event title"
                aria-label="Title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
              <CreateDialogFieldList>
                <CreateDialogField icon={Clock} label="When">
                  <DayPill value={start} onChange={moveDay} />
                  {!allDay && (
                    <>
                      <TimePill label="Start time" value={start} onChange={moveStart} />
                      <Icon
                        icon={ArrowRight}
                        size={12}
                        style={{ color: 'var(--muted-foreground)' }}
                      />
                      <TimePill label="End time" value={end} onChange={setEnd} />
                    </>
                  )}
                  <span style={{ marginLeft: 'auto' }}>
                    <Switch checked={allDay} onCheckedChange={setAllDay}>
                      All day
                    </Switch>
                  </span>
                </CreateDialogField>
                <CreateDialogField icon={Repeat} label="Repeat">
                  <RepeatPill rule={rule} start={start} onChange={setRule} />
                </CreateDialogField>
                {calendar && (
                  <CreateDialogField icon={CalendarGlyph} label="Calendar">
                    <CalendarPill value={calendar} calendars={calendars} onChange={setCalendarId} />
                  </CreateDialogField>
                )}
                <CreateDialogField icon={MapPin} label="Location">
                  <Input
                    placeholder="Add location"
                    aria-label="Location"
                    value={location}
                    onChange={(event) => setLocation(event.currentTarget.value)}
                  />
                </CreateDialogField>
                <CreateDialogField icon={Video} label="Meeting link">
                  <Input
                    placeholder="Add meeting link"
                    aria-label="Meeting link"
                    aria-invalid={meetingUrl === null || undefined}
                    value={meeting}
                    onChange={(event) => setMeeting(event.currentTarget.value)}
                  />
                </CreateDialogField>
                <CreateDialogField icon={FileText} label="Description">
                  <Textarea
                    placeholder="Add description…"
                    aria-label="Description"
                    value={description}
                    onChange={(event) => setDescription(event.currentTarget.value)}
                  />
                </CreateDialogField>
              </CreateDialogFieldList>
            </CreateDialogBody>
            <CreateDialogFooter>
              <DialogClose render={<Button variant="ghost" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!canCreate}>
                Create Event
              </Button>
            </CreateDialogFooter>
          </form>
        </KeyScope>
      </CreateDialogContent>
    </Dialog>
  );
}
