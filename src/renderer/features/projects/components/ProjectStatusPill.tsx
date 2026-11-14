import { useState } from 'react';
import { ProjectStatus } from '@common/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  EntityPill,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  ProjectStatusIcon,
  ValueMenuContent,
  type ValueMenuOption,
} from '@renderer/components';

// the project status menu (Figma `7424:39896`): the four statuses with their keys, 1 to 4
const OPTIONS: ValueMenuOption<ProjectStatus>[] = PROJECT_STATUSES.map((status, index) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
  icon: <ProjectStatusIcon status={status} />,
  key: String(index + 1),
  shortcut: String(index + 1),
}));

/**
 * A project's status as a pill that opens the status menu (Figma `7424:39896`): the header's and a
 * card's. Picking, or pressing 1 to 4, sets it and closes the menu. A synced project's pill is
 * plain (`disabled`), as its status is its provider's.
 */
export function ProjectStatusPill({
  status,
  onChange,
  disabled,
}: {
  status: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pill = (
    <EntityPill interactive={!disabled} glyph={<ProjectStatusIcon status={status} size={12} />}>
      {PROJECT_STATUS_LABELS[status]}
    </EntityPill>
  );
  if (disabled) return pill;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={pill} />
      <ValueMenuContent
        label="Status"
        options={OPTIONS}
        value={status}
        align="start"
        onPick={(picked) => {
          if (picked !== status) onChange(picked);
          setOpen(false);
        }}
      />
    </DropdownMenu>
  );
}
