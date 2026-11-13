import { useState, type ReactNode } from 'react';
import { Calendar, Plus } from 'lucide-react';
import type { ProjectId } from '@common/ids';
import type { TaskPriority, TaskStatus } from '@common/types';
import {
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EntityPill,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PRIORITY_LABELS,
  PriorityIcon,
  PriorityMenu,
  StatusIcon,
  StatusMenu,
  TASK_STATUS_LABELS,
  useFormat,
} from '../../../components';
import { PickerSearchFilter } from '../../search/picker-search';
import { ProjectItems } from './TaskMenus';
import { useProjectOptions } from './use-project-options';
import { usePickedProject } from './use-project-search';

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
  const project = usePickedProject(value, useProjectOptions());
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
    <PickerSearchFilter>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger render={pill} />
        <DropdownMenuContent width="lg" align="start">
          <ProjectItems
            projectId={value}
            onPick={(projectId) => {
              onChange(projectId);
              setOpen(false);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </PickerSearchFilter>
  );
}
