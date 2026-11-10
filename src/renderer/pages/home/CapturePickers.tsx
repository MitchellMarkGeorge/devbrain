import { useState } from 'react';
import { Calendar, Clock, Folder, Timer } from 'lucide-react';
import { DateTime } from 'luxon';
import type { CalendarId, ProjectId } from '@common/ids';
import type { Calendar as CalendarRow, TaskPriority } from '@common/types';
import {
  CaptureBoxPicker,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuFilter,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  NO_PROJECT,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PRIORITY_LABELS,
  PriorityIcon,
  PriorityMenu,
  ProjectPickerItems,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useFormat,
  type PickerProject,
} from '../../components';

// The capture box's pickers (Figma 7675:50883): outline pills under the field showing what the
// text filled in or what was picked, each opening its picker. A pick wins over the text.

export function CaptureProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: readonly PickerProject[];
  value: ProjectId | null;
  onChange: (projectId: ProjectId | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const project = projects.find((p) => p.id === value);
  return (
    <DropdownMenuFilter>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <CaptureBoxPicker icon={Folder} iconColor={project?.color}>
              {project?.name ?? 'No project'}
            </CaptureBoxPicker>
          }
        />
        <DropdownMenuContent width="lg" align="start">
          <ProjectPickerItems
            projects={projects}
            value={value ?? NO_PROJECT}
            onValueChange={(id) => {
              onChange(id === NO_PROJECT ? null : (id as ProjectId));
              setOpen(false);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </DropdownMenuFilter>
  );
}

/** A task's due date: "Today", "Tomorrow", "Jul 1", or "No date". */
export function CaptureDatePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { now, formatDue } = useFormat();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <CaptureBoxPicker icon={Calendar}>
            {value ? formatDue(value) : 'No date'}
          </CaptureBoxPicker>
        }
      />
      <PopoverContent size="auto" align="start">
        <DatePicker
          value={value ?? undefined}
          today={now}
          onChange={(date) => {
            onChange(date ?? null);
            setOpen(false);
          }}
          onClear={
            value
              ? () => {
                  onChange(null);
                  setOpen(false);
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

export function CapturePriorityPicker({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
}) {
  return (
    <PriorityMenu
      priority={value}
      onPriorityChange={onChange}
      trigger={
        <CaptureBoxPicker icon={<PriorityIcon priority={value} size={12} />}>
          {PRIORITY_LABELS[value]}
        </CaptureBoxPicker>
      }
    />
  );
}

/** The calendars an event can be added to: the local ones (synced calendars are read-only). */
export function CaptureCalendarPicker({
  calendars,
  value,
  onChange,
}: {
  calendars: readonly CalendarRow[];
  value: CalendarId | undefined;
  onChange: (calendarId: CalendarId) => void;
}) {
  const calendar = calendars.find((c) => c.id === value) ?? calendars[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <CaptureBoxPicker icon={Calendar} iconColor={calendar?.color ?? undefined}>
            {calendar?.name ?? 'Calendar'}
          </CaptureBoxPicker>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={calendar?.id}
          onValueChange={(id) => onChange(id as CalendarId)}
        >
          {calendars.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id}>
              {c.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// every half hour of the day, in minutes after midnight
const TIMES = Array.from({ length: 48 }, (_, index) => index * 30);

/** An event's start: "Today, 3:00 PM", opening the date picker with a time. */
export function CaptureStartPicker({
  value,
  onDateChange,
  onTimeChange,
}: {
  value: Date;
  onDateChange: (date: Date) => void;
  onTimeChange: (minutes: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { now, formatDue, formatTime } = useFormat();
  const day = DateTime.fromJSDate(value).startOf('day');
  const minutes = DateTime.fromJSDate(value).diff(day, 'minutes').minutes;
  const times = TIMES.includes(minutes) ? TIMES : [...TIMES, minutes].sort((a, b) => a - b);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <CaptureBoxPicker icon={Clock}>
            {formatDue(value)}, {formatTime(value)}
          </CaptureBoxPicker>
        }
      />
      <PopoverContent size="auto" align="start">
        <DatePicker
          value={day.toJSDate()}
          today={now}
          onChange={(date) => {
            if (date) onDateChange(date);
          }}
          time={
            <Select value={String(minutes)} onValueChange={(next) => onTimeChange(Number(next))}>
              <SelectTrigger aria-label="Time">
                <Icon icon={Clock} />
                <SelectValue>{formatTime(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {times.map((time) => (
                  <SelectItem key={time} value={String(time)}>
                    {formatTime(day.plus({ minutes: time }).toJSDate())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </PopoverContent>
    </Popover>
  );
}

const LENGTHS = [15, 30, 45, 60, 90, 120];

const lengthLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
      : `${minutes / 60} hours`;

/** How long an event lasts: "30 min", "1 hour". */
export function CaptureLengthPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<CaptureBoxPicker icon={Timer}>{lengthLabel(value)}</CaptureBoxPicker>}
      />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={String(value)} onValueChange={(v) => onChange(Number(v))}>
          {LENGTHS.map((minutes) => (
            <DropdownMenuRadioItem key={minutes} value={String(minutes)}>
              {lengthLabel(minutes)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
