import { useState, type ReactNode } from 'react';
import { Calendar, Plus } from 'lucide-react';
import type { ProjectId } from '@common/ids';
import type { TaskPriority, TaskStatus } from '@common/types';
import {
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuFilter,
  DropdownMenuTrigger,
  EntityPill,
  NO_PROJECT,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PRIORITY_LABELS,
  PriorityIcon,
  PriorityMenu,
  ProjectPickerItems,
  StatusIcon,
  StatusMenu,
  TASK_STATUS_LABELS,
  useFormat,
} from '@renderer/components';
import { useProjectOptions } from '../../hooks/use-project-options';

// A task's properties as pills that open their pickers (Figma 7175:28012, 7175:28582): the create
// dialog's property bar, and anywhere else a property is a pill. Each is controlled: it shows
// `value` and reports a pick.

export function StatusPill({
  value,
  onChange,
  disabled,
}: {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}) {
  const pill = (
    <EntityPill interactive={!disabled} glyph={<StatusIcon status={value} size={12} />}>
      {TASK_STATUS_LABELS[value]}
    </EntityPill>
  );
  if (disabled) return pill;
  return <StatusMenu status={value} onStatusChange={onChange} trigger={pill} />;
}

export function PriorityPill({
  value,
  onChange,
  disabled,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  disabled?: boolean;
}) {
  const pill = (
    <EntityPill interactive={!disabled} glyph={<PriorityIcon priority={value} size={12} />}>
      {PRIORITY_LABELS[value]}
    </EntityPill>
  );
  if (disabled) return pill;
  return <PriorityMenu priority={value} onPriorityChange={onChange} trigger={pill} />;
}

/** A date as a pill ("Jun 26", or `placeholder` while unset), opening the date picker. */
export function DatePill({
  value,
  onChange,
  placeholder = 'Due date',
  prefix,
  disabled,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  /** quiet words before the date: "Due", "Starts" */
  prefix?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { now, formatDate } = useFormat();
  const pill = (
    <EntityPill interactive={!disabled} glyph={Calendar} prefix={value ? prefix : undefined}>
      {value ? formatDate(value) : placeholder}
    </EntityPill>
  );
  if (disabled) return pill;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={pill} />
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

/** The project as a pill (its folder in its colour), or "+ Project", opening the project picker. */
export function ProjectPill({
  value,
  onChange,
  disabled,
  placeholder = 'Project',
}: {
  value: ProjectId | null;
  onChange: (projectId: ProjectId | null) => void;
  disabled?: boolean;
  /** the "+" pill's words while there is no project: "Project", "Add to project" */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const projects = useProjectOptions();
  const project = projects.find((p) => p.id === value);
  const pill = project ? (
    <EntityPill
      interactive={!disabled}
      entity={{ type: 'project', title: project.name, color: project.color }}
    />
  ) : (
    <EntityPill interactive={!disabled} glyph={Plus}>
      {placeholder}
    </EntityPill>
  );
  if (disabled) return pill;
  return (
    <DropdownMenuFilter>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger render={pill} />
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
