import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  CircleCheck,
  Clock,
  ExternalLink,
  MapPin,
  Repeat,
  Trash2,
  Video,
} from 'lucide-react';
import type { EventId, TaskId } from '@common/ids';
import { EventResponse, type Calendar, type Event } from '@common/types';
import {
  Button,
  DetailRow,
  DetailRows,
  EntityPill,
  GoogleCalendarLogo,
  Icon,
  ReadOnlyRow,
  resolveColor,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDivider,
  SheetHeader,
  SheetItemTitle,
  Skeleton,
  Stack,
  SyncedBadge,
  Text,
  useFormat,
  useWorkspaceShell,
} from '../../../components';
import { RichTextEditor } from '../../../editor/RichTextEditor';
import { trpc } from '../../../ipc';
import { ipcErrorCode } from '../../../workspace/errors';
import { useEditorAutosave } from '../../app/autosave';
import { useEditorHost } from '../../app/use-editor-host';
import { dayText, useEventActions } from '../edit/use-event-actions';
import { seriesOccurrenceOf, type EventPatch, type EventTarget } from '../edit/occurrence';
import { meetingUrlOf } from '../create/CreateEventDialog';
import { CalendarPill, DayPill, RepeatPill, TimePill } from '../pickers';
import { repeatText } from '../repeat';
import { EventLinkedTasks } from './EventLinkedTasks';
import { EventNoteSection, eventNoteQuery } from './EventNoteSection';
import { EventNoteFooter, EventNoteView } from './EventNoteView';
import { useOpenEntity } from '../../app/use-open-entity';
import { moveEnd, moveStart, moveToDay, shownTiming, zoneAbbreviation } from './timing';
import styles from './EventSheet.module.css';

export const RESPONSE_LABELS: Record<EventResponse, string> = {
  [EventResponse.ACCEPTED]: 'Going',
  [EventResponse.TENTATIVE]: 'Maybe',
  [EventResponse.DECLINED]: 'Not going',
  [EventResponse.NEEDS_ACTION]: 'Not answered',
};

export interface EventSheetProps {
  eventId: EventId;
  /** for an expanded occurrence of a series: its start */
  occurrence?: Date;
  /** false while it slides out: the page keeps it mounted until `onClosed` */
  open: boolean;
  /** closes the sheet (removes `open` from the URL) */
  onClose: () => void;
  onClosed: () => void;
  /** shows another event in the sheet: the row an edit of one occurrence made, a new series */
  onShowEvent: (id: EventId, occurrence?: Date) => void;
  onOpenTask: (id: TaskId) => void;
  /** the sheet shows the event's note (`?sheet=note`) */
  noteView?: boolean;
  /** shows the event's note in the sheet: its card, "+ Add a note" */
  onOpenNote: () => void;
  /** back to the event from its note: "‹ Event" */
  onCloseNote: () => void;
}

/**
 * The event sheet (`?open=evt_…`, Figma `7175:30140`): the event's detail view, as events have
 * no page of their own. Docked in the shell's sheet column in wide and medium windows, floating in
 * compact ones. A local event is edited in place; one of a series asks which occurrences each
 * change applies to. A synced (Google) event is read-only, with your response. With `noteView`, it
 * shows the event's note instead (`EventNoteView`), with "‹ Event" back to the event.
 */
export function EventSheet({
  eventId,
  occurrence,
  open,
  onClose,
  onClosed,
  onShowEvent,
  onOpenTask,
  noteView = false,
  onOpenNote,
  onCloseNote,
}: EventSheetProps) {
  const router = useRouter();
  const { size, sheetContainer } = useWorkspaceShell();
  const floating = size === 'compact';
  const openedHere = useRouterState({ select: (state) => state.location.state.openedSheet });
  // a deleted event is gone for good: no retries, so a delete's refetch settles at once
  const query = useQuery({
    ...trpc.events.get.queryOptions({ id: eventId }),
    retry: retryUnlessGone,
  });
  const calendars = useQuery(trpc.calendars.list.queryOptions()).data ?? [];
  const note = useQuery({ ...eventNoteQuery(eventId), enabled: noteView }).data?.items[0];
  const openEntity = useOpenEntity();

  const close = () => {
    if (openedHere) router.history.back();
    else onClose();
  };

  if (!floating && !sheetContainer) return null;
  return (
    <Sheet
      open={open}
      variant={floating ? 'overlay' : 'docked'}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed();
      }}
    >
      <SheetContent container={floating ? undefined : sheetContainer} data-testid="event-sheet">
        {noteView ? (
          <SheetHeader onOpenAsPage={note ? () => openEntity({ id: note.id }) : undefined}>
            <Button size="xs" variant="ghost" icon={ChevronLeft} onClick={onCloseNote}>
              Event
            </Button>
          </SheetHeader>
        ) : (
          <SheetHeader>Event</SheetHeader>
        )}
        <SheetBody>
          {query.data ? (
            <EventSheetBody
              key={`${query.data.id}@${occurrence?.getTime() ?? ''}`}
              target={{ event: query.data, occurrenceStart: occurrence }}
              calendars={calendars}
              onShowEvent={onShowEvent}
              onOpenTask={onOpenTask}
              onDeleted={onClose}
              noteView={noteView}
              onOpenNote={onOpenNote}
            />
          ) : query.isError ? (
            <Text tone="muted">
              {ipcErrorCode(query.error) === 'not_found'
                ? 'This event was deleted.'
                : 'This event couldn’t be loaded.'}
            </Text>
          ) : (
            <Stack gap="3" aria-busy>
              <Skeleton height={20} width="70%" />
              <Skeleton height={16} width="50%" />
              <Skeleton height={16} width="60%" />
            </Stack>
          )}
        </SheetBody>
        {noteView && note && <EventNoteFooter />}
      </SheetContent>
    </Sheet>
  );
}

function retryUnlessGone(failures: number, error: unknown): boolean {
  return ipcErrorCode(error) !== 'not_found' && failures < 3;
}

interface BodyProps {
  target: EventTarget;
  calendars: readonly Calendar[];
  onShowEvent: (id: EventId, occurrence?: Date) => void;
  onOpenTask: (id: TaskId) => void;
  onDeleted: () => void;
  noteView: boolean;
  onOpenNote: () => void;
}

/** The sheet's body for a loaded event. */
function EventSheetBody({
  target,
  calendars,
  onShowEvent,
  onOpenTask,
  onDeleted,
  noteView,
  onOpenNote,
}: BodyProps) {
  const { event } = target;
  const calendar = calendars.find((c) => c.id === event.calendarId);
  const synced = event.external != null;
  const occurrence = seriesOccurrenceOf(target);
  // an occurrence row repeats with its series: its rule is the master's
  const series = useQuery({
    ...trpc.events.get.queryOptions({ id: occurrence?.seriesId ?? event.id }),
    enabled: occurrence !== null && occurrence.seriesId !== event.id,
    retry: retryUnlessGone,
  }).data;
  const rule = event.seriesId ? (series?.recurrenceRule ?? null) : event.recurrenceRule;
  const ruleStart = event.seriesId ? (series?.startAt ?? event.startAt) : event.startAt;
  const shown = shownTiming(event, occurrence);
  const { formatTime } = useFormat();
  const actions = useEventActions();

  const edit = (patch: EventPatch, summary?: string) =>
    void actions.edit(target, patch, {
      summary,
      onSaved: (saved, scope) => {
        if (saved.id !== event.id) {
          onShowEvent(saved.id, saved.recurrenceRule ? saved.startAt : undefined);
        } else if (scope === 'all' && target.occurrenceStart && patch.startAt) {
          // the occurrence shown moved with the series
          onShowEvent(event.id, patch.startAt);
        }
      },
    });
  const timeSummary = (patch: EventPatch) =>
    patch.startAt || patch.endAt
      ? `${formatTime(patch.startAt ?? shown.start)} – ${formatTime(patch.endAt ?? shown.end)}`
      : undefined;

  const barColor = resolveColor(event.color) ?? resolveColor(calendar?.color, 'blue');
  const zone = zoneAbbreviation(shown.start);
  if (noteView) return <EventNoteView event={event} shown={shown} color={barColor} />;

  return (
    <>
      <SheetTitle event={event} barColor={barColor} onRename={(title) => edit({ title })} />
      {synced && (
        <SyncedBadge logo={<GoogleCalendarLogo size={16} />}>
          Google Calendar{calendar ? ` · ${calendar.name}` : ''}
        </SyncedBadge>
      )}
      <DetailRows>
        {synced ? (
          <>
            <ReadOnlyRow label="Date" glyph={CalendarDays}>
              {dayText(shown.start)}
            </ReadOnlyRow>
            <ReadOnlyRow label="Time" glyph={Clock}>
              {shown.allDay
                ? 'All day'
                : `${formatTime(shown.start)} – ${formatTime(shown.end)} (${zone})`}
            </ReadOnlyRow>
            {rule && (
              <ReadOnlyRow label="Repeats" glyph={Repeat}>
                {repeatText(rule, ruleStart)}
              </ReadOnlyRow>
            )}
            {calendar && (
              <ReadOnlyRow
                label="Calendar"
                glyph={<CalendarBar color={resolveColor(calendar.color, 'blue')} />}
              >
                {calendar.name}
              </ReadOnlyRow>
            )}
            {event.location && (
              <ReadOnlyRow label="Location" glyph={MapPin}>
                {event.location}
              </ReadOnlyRow>
            )}
            <MeetingRow url={event.meetingUrl} />
            {event.response && (
              <ReadOnlyRow label="Response" glyph={CircleCheck}>
                {RESPONSE_LABELS[event.response]}
              </ReadOnlyRow>
            )}
          </>
        ) : (
          <>
            <DetailRow label="Date">
              <DayPill
                withGlyph
                value={shown.start}
                onChange={(day) => edit(moveToDay(shown, day), dayText(day))}
              />
            </DetailRow>
            <DetailRow label="Time">
              {shown.allDay ? (
                <EntityPill glyph={Clock}>All day</EntityPill>
              ) : (
                <>
                  <TimePill
                    label="Start time"
                    value={shown.start}
                    onChange={(time) => {
                      const patch = moveStart(shown, time);
                      edit(patch, timeSummary(patch));
                    }}
                  />
                  <Icon icon={ArrowRight} size={12} className={styles.arrow} />
                  <TimePill
                    label="End time"
                    value={shown.end}
                    onChange={(time) => {
                      const patch = moveEnd(shown, time);
                      if (patch) edit(patch, timeSummary(patch));
                    }}
                  />
                  <span className={styles.zone}>{zone}</span>
                </>
              )}
            </DetailRow>
            <DetailRow label="Repeats">
              <RepeatPill
                withGlyph
                rule={rule}
                start={ruleStart}
                onChange={(recurrenceRule) => edit({ recurrenceRule })}
              />
            </DetailRow>
            <DetailRow label="Calendar">
              <CalendarPill
                value={event.calendarId}
                calendars={calendars}
                onChange={(calendarId) => edit({ calendarId })}
              />
            </DetailRow>
            <DetailRow label="Location">
              <InlineText
                label="Location"
                glyph={MapPin}
                value={event.location ?? ''}
                placeholder="Add location"
                onSave={(location) => edit({ location })}
              />
            </DetailRow>
            <DetailRow label="Meeting">
              <InlineText
                label="Meeting link"
                glyph={Video}
                value={(event.meetingUrl ?? '').replace(/^https:\/\//, '')}
                placeholder="Add meeting link"
                valid={(text) => meetingUrlOf(text) !== null}
                onSave={(text) => {
                  const url = meetingUrlOf(text);
                  if (url) edit({ meetingUrl: url });
                }}
              />
              {event.meetingUrl && <JoinButton url={event.meetingUrl} />}
            </DetailRow>
          </>
        )}
      </DetailRows>
      {synced && event.external && (
        <SyncHint
          lastSyncedAt={event.external.lastSyncedAt}
          url={event.external.url}
          responds={event.response != null}
        />
      )}
      <SheetDivider />
      <EventDescription
        event={event}
        editable={!synced}
        series={occurrence !== null}
        onSave={(description) => edit({ description })}
      />
      <EventNoteSection event={event} onOpenNote={onOpenNote} />
      <EventLinkedTasks eventId={event.id} onOpenTask={onOpenTask} />
      {!synced && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={() => void actions.remove(target, onDeleted)}
          >
            Delete event
          </Button>
        </div>
      )}
    </>
  );
}

// the title, editable in place for a local event: saved on Enter or when it loses focus
function SheetTitle({
  event,
  barColor,
  onRename,
}: {
  event: Event;
  barColor: string | undefined;
  onRename: (title: string) => void;
}) {
  const [title, setTitle] = useState(event.title);
  if (event.external) return <SheetItemTitle barColor={barColor}>{event.title}</SheetItemTitle>;
  const save = () => {
    const next = title.trim();
    if (next && next !== event.title) onRename(next);
    else setTitle(event.title);
  };
  return (
    <SheetItemTitle barColor={barColor}>
      <input
        className={styles.titleInput}
        aria-label="Title"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onBlur={save}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape' && title !== event.title) {
            e.stopPropagation();
            setTitle(event.title);
          }
        }}
      />
    </SheetItemTitle>
  );
}

// a short text property edited in place (location, meeting link): saved on Enter or blur
function InlineText({
  label,
  glyph,
  value,
  placeholder,
  valid = () => true,
  onSave,
}: {
  label: string;
  glyph: typeof MapPin;
  value: string;
  placeholder: string;
  valid?: (text: string) => boolean;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // a save (or another window) changed it: show the new value
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  const save = () => {
    const next = text.trim();
    if (next !== value && valid(next)) onSave(next);
    else setText(value);
  };
  return (
    <label className={styles.inline}>
      <Icon icon={glyph} size={14} className={styles.inlineGlyph} />
      <input
        className={styles.inlineInput}
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={save}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape' && text !== value) {
            e.stopPropagation();
            setText(value);
          }
        }}
      />
    </label>
  );
}

function JoinButton({ url }: { url: string }) {
  const openUrl = useMutation(trpc.workspace.openUrl.mutationOptions());
  return (
    <Button size="xs" icon={Video} onClick={() => openUrl.mutate({ url })}>
      Join
    </Button>
  );
}

function MeetingRow({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <DetailRow label="Meeting">
      <span className={styles.meeting}>{url.replace(/^https?:\/\//, '')}</span>
      <JoinButton url={url} />
    </DetailRow>
  );
}

function SyncHint({
  lastSyncedAt,
  url,
  responds,
}: {
  lastSyncedAt: Date;
  url: string;
  responds: boolean;
}) {
  const { formatRelative } = useFormat('minute');
  const openUrl = useMutation(trpc.workspace.openUrl.mutationOptions());
  return (
    <div className={styles.syncHint}>
      <span className={styles.syncLine}>
        Synced from Google Calendar {formatRelative(lastSyncedAt).toLowerCase()} ·{' '}
        {responds ? 'Change your response in Google Calendar' : 'Edit in Google Calendar'}
      </span>
      <div>
        <Button size="sm" icon={ExternalLink} onClick={() => openUrl.mutate({ url })}>
          Open in Google Calendar
        </Button>
      </div>
    </div>
  );
}

function CalendarBar({ color }: { color: string | undefined }) {
  return (
    <span className={styles.calendarBar} aria-hidden>
      <span style={{ background: color }} />
    </span>
  );
}

/**
 * The description, in the editor. A one-off saves as you type; a series saves once you leave the
 * editor, so the question of which occurrences is asked once for the edit, not per pause.
 */
function EventDescription({
  event,
  editable,
  series,
  onSave,
}: {
  event: Event;
  editable: boolean;
  series: boolean;
  onSave: (description: string) => void;
}) {
  const host = useEditorHost();
  const pending = useRef<string | null>(null);
  const toDescription = (markdown: string) => (markdown.trim() === '' ? '' : markdown);
  const description = useEditorAutosave(event.description ?? '', (markdown) => {
    if (series) return;
    const stored = toDescription(markdown);
    onSave(stored);
    return stored;
  });
  if (!editable && !event.description) return null;
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    const markdown = pending.current;
    pending.current = null;
    if (markdown !== null && markdown !== (event.description ?? '')) {
      onSave(toDescription(markdown));
    }
  };
  return (
    <div onBlur={series ? onBlur : undefined}>
      <RichTextEditor
        {...host}
        className={styles.description}
        label="Description"
        value={series ? (event.description ?? '') : description.value}
        editable={editable}
        placeholder="Add a description…"
        onChange={(markdown) => {
          if (series) pending.current = markdown;
          else description.onChange(markdown);
        }}
      />
    </div>
  );
}
