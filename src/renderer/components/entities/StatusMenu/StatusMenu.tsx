import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
  type DropdownMenuContentProps,
} from '../../ui/DropdownMenu';
import { StatusIcon } from '../StatusIcon';
import { TaskStatus } from '@common/types';
import { TASK_STATUS_LABELS } from '../../types';
import styles from './StatusMenu.module.css';

/** One value of a `ValueMenuContent`: its icon, its name and the key that picks it. */
export interface ValueMenuOption<Value extends string | number> {
  value: Value;
  label: ReactNode;
  icon: ReactNode;
  /** the key that picks it while the menu is open ("1", or "!" for ⇧1) */
  key: string;
  /** how the shortcut reads on the right ("1", "⇧1") */
  shortcut: ReactNode;
}

export interface ValueMenuContentProps<Value extends string | number> extends Omit<
  DropdownMenuContentProps,
  'children' | 'width' | 'onKeyDown'
> {
  /** the label over the values ("Status", "Priority") */
  label: string;
  options: readonly ValueMenuOption<Value>[];
  /** the current value: ticked and highlighted */
  value: Value | undefined;
  onPick?: (value: Value) => void;
  /** draws it as a submenu's popup (a task menu's Status ›) */
  submenu?: boolean;
}

/**
 * A single-value picker menu (StatusMenu, PriorityMenu): a label, then each value with its icon.
 * The current value is ticked and highlighted; the others show their shortcut, which picks them
 * while the menu is open.
 */
export function ValueMenuContent<Value extends string | number>({
  label,
  options,
  value,
  onPick,
  submenu,
  className,
  ...props
}: ValueMenuContentProps<Value>) {
  const Content = submenu ? DropdownMenuSubContent : DropdownMenuContent;
  function onKeyDown(event: KeyboardEvent) {
    const option = options.find((item) => item.key === event.key);
    if (!option) return;
    event.preventDefault();
    onPick?.(option.value);
  }
  return (
    <Content aria-label={label} className={className} width="sm" onKeyDown={onKeyDown} {...props}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(picked: unknown) => onPick?.(picked as Value)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick
              icon={option.icon}
              shortcut={option.shortcut}
              className={styles.item}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </Content>
  );
}

/** The statuses a user picks, in menu order, with their shortcuts. */
export const PICKABLE_STATUSES = [
  TaskStatus.NOT_STARTED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
] as const;
export type PickableStatus = (typeof PICKABLE_STATUSES)[number];

const STATUS_OPTIONS: ValueMenuOption<PickableStatus>[] = PICKABLE_STATUSES.map(
  (status, index) => ({
    value: status,
    label: TASK_STATUS_LABELS[status],
    icon: <StatusIcon status={status} />,
    key: String(index + 1),
    shortcut: String(index + 1),
  }),
);

/** The status the menu ticks: none for a cancelled task, which the menu does not offer. */
function currentOf(status: TaskStatus): PickableStatus | undefined {
  return (PICKABLE_STATUSES as readonly TaskStatus[]).includes(status)
    ? (status as PickableStatus)
    : undefined;
}

export interface StatusMenuContentProps extends Omit<
  ValueMenuContentProps<PickableStatus>,
  'label' | 'options' | 'value'
> {
  /** the task's status; the matching item is ticked and highlighted */
  status: TaskStatus;
}

/**
 * The status menu's popup: a "Status" label, then Not started, In progress and Completed with
 * their icons. The current status is ticked; the others show their shortcut. Put it inside a
 * `DropdownMenu` (or use `StatusMenu`, which wires the trigger and the shortcuts' closing).
 */
export function StatusMenuContent({ status, ...props }: StatusMenuContentProps) {
  return (
    <ValueMenuContent
      label="Status"
      options={STATUS_OPTIONS}
      value={currentOf(status)}
      {...props}
    />
  );
}

/** Open state that a parent may control, closing when a value is picked. */
export function usePickerOpen(
  openProp: boolean | undefined,
  defaultOpen: boolean,
  onOpenChange?: (open: boolean) => void,
) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }
  return [open, setOpen] as const;
}

export interface StatusMenuProps {
  status: TaskStatus;
  onStatusChange?: (status: PickableStatus) => void;
  /** the element that opens the menu: a status icon button */
  trigger: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** where the popup sits against the trigger */
  side?: StatusMenuContentProps['side'];
  align?: StatusMenuContentProps['align'];
}

/**
 * A status icon button and the menu it opens. Picking (or pressing `1`, `2`, `3`) sets the status
 * and closes the menu.
 */
export function StatusMenu({
  status,
  onStatusChange,
  trigger,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  side,
  align,
}: StatusMenuProps) {
  const [open, setOpen] = usePickerOpen(openProp, defaultOpen, onOpenChange);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={trigger} />
      <StatusMenuContent
        status={status}
        side={side}
        align={align}
        onPick={(picked) => {
          onStatusChange?.(picked);
          setOpen(false);
        }}
      />
    </DropdownMenu>
  );
}
