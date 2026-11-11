import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { CalendarId, ProjectId } from '@common/ids';
import { TaskPriority } from '@common/types';
import { CaptureBox, toast, useFormat, type CaptureKind } from '../../components';
import { ipc, trpc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useOpenEntity } from '../app/use-open-entity';
import { defaultDueDate } from '../tasks/create/CreateTaskDialog';
import { useProjectOptions } from '../tasks/menus/use-project-options';
import { eventMinutes, eventStart, parseCapture } from './capture';
import {
  CaptureCalendarPicker,
  CaptureDatePicker,
  CaptureLengthPicker,
  CapturePriorityPicker,
  CaptureProjectPicker,
  CaptureStartPicker,
} from './CapturePickers';

/** What was picked in the pickers; each wins over what the text says. Cleared after each add. */
interface Picked {
  projectId?: ProjectId | null;
  date?: Date | null;
  priority?: TaskPriority;
  calendarId?: CalendarId;
  /** an event's day and minutes after midnight */
  day?: Date;
  time?: number;
  minutes?: number;
}

const TIPS: Record<CaptureKind, string> = {
  task: 'Type “tomorrow” or “#‹project›” and the details fill in. Press Enter to add.',
  note: 'Type “#‹project›” to file it. Press Enter to add it and start writing.',
  event: 'Type a day and a time, like “tomorrow at 3pm”. Press Enter to add.',
};

/**
 * Home's capture box: Task, Note or Event. The text is read for a date, a time (events) and a
 * `#project`, marked in the field and shown in the pickers; Enter creates it with
 * `tasks.create`, `notes.create` (then opens the note) or `events.create`.
 */
export function HomeCapture({ firstRun }: { firstRun: boolean }) {
  const { now } = useFormat();
  // the event's start moves with the clock ("Today, 10:30 AM" at the next half hour)
  const minute = useFormat('minute').now;
  const settings = useQuery(trpc.settings.get.queryOptions()).data;
  const calendars = useQuery(trpc.calendars.list.queryOptions()).data;
  const projects = useProjectOptions();
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast();
  const [kind, setKind] = useState<CaptureKind>('task');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Picked>({});
  const pick = (next: Picked) => setPicked((current) => ({ ...current, ...next }));

  const parsed = useMemo(
    () =>
      parseCapture(text, {
        today: now,
        projects: projects.map((p) => ({ id: p.id as ProjectId, title: p.name })),
        times: kind === 'event',
      }),
    [text, now, projects, kind],
  );
  // an example project for the tip, as Figma's "#Auth Overhaul"
  const example = projects[0]?.name ?? 'Project';

  const projectId =
    picked.projectId !== undefined ? picked.projectId : (parsed.project?.id ?? null);
  const dueDate =
    picked.date !== undefined
      ? picked.date
      : (parsed.date ?? defaultDueDate(settings?.tasks.defaultDueDate, now));
  const priority = picked.priority ?? settings?.tasks.defaultPriority ?? TaskPriority.LOW;
  const localCalendars = (calendars ?? []).filter((c) => c.sourceId === null);
  const length = picked.minutes ?? eventMinutes(settings?.calendar?.defaultEventDuration);
  // the event's start as the box shows it; read again from the clock when it is added
  const startOf = (at: Date) =>
    eventStart({ date: picked.day ?? parsed.date, time: picked.time ?? parsed.time }, at);
  const start = startOf(minute);

  async function create(value: string) {
    const title = parsed.title || value;
    setPicked({});
    try {
      if (kind === 'task') {
        const task = await ipc.tasks.create.mutate({
          title,
          dueDate,
          priority,
          projectId: projectId ?? undefined,
        });
        toast({
          tone: 'success',
          title: 'Task created',
          description: task.title,
          action: { label: 'Open', onClick: () => openEntity({ id: task.id }) },
        });
      } else if (kind === 'note') {
        const note = await ipc.notes.create.mutate({ title, projectId: projectId ?? undefined });
        openEntity({ id: note.id });
      } else {
        const startAt = startOf(new Date());
        const event = await ipc.events.create.mutate({
          title,
          startAt,
          endAt: DateTime.fromJSDate(startAt).plus({ minutes: length }).toJSDate(),
          calendarId: picked.calendarId,
        });
        toast({
          tone: 'success',
          title: 'Event created',
          description: event.title,
          action: { label: 'Open', onClick: () => openEntity(event) },
        });
      }
    } catch (error) {
      // put the text back, so nothing typed is lost
      setText(value);
      showError(error, `Couldn’t add the ${kind}`);
    }
  }

  const pickers =
    kind === 'event' ? (
      <>
        <CaptureCalendarPicker
          calendars={localCalendars}
          value={picked.calendarId}
          onChange={(calendarId) => pick({ calendarId })}
        />
        <CaptureStartPicker
          value={start}
          onDateChange={(day) => pick({ day })}
          onTimeChange={(time) => pick({ time })}
        />
        <CaptureLengthPicker value={length} onChange={(minutes) => pick({ minutes })} />
      </>
    ) : (
      <>
        <CaptureProjectPicker
          projects={projects}
          value={projectId}
          onChange={(id) => pick({ projectId: id })}
        />
        {kind === 'task' && (
          <>
            <CaptureDatePicker value={dueDate} onChange={(date) => pick({ date })} />
            <CapturePriorityPicker value={priority} onChange={(p) => pick({ priority: p })} />
          </>
        )}
      </>
    );

  return (
    <CaptureBox
      value={text}
      onValueChange={(value) => {
        setText(value);
        if (!value) setPicked({});
      }}
      kind={kind}
      onKindChange={setKind}
      onSubmit={(value) => void create(value)}
      highlights={parsed.highlights}
      pickers={pickers}
      tip={
        firstRun && kind === 'task'
          ? 'Try “Draft Q3 roadmap tomorrow”. Press Enter to add it.'
          : TIPS[kind].replace('‹project›', example)
      }
    />
  );
}
