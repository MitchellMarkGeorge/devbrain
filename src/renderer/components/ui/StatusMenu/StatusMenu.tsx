import { useState, type KeyboardEvent, type ReactElement } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  menuItemVariants,
  menuStyles,
  type DropdownMenuContentProps,
} from '../DropdownMenu';
import { DropdownMenuTrigger } from '../DropdownMenu';
import { Icon } from '../Icon';
import { StatusIcon } from '../StatusIcon';
import { TASK_STATUS_LABELS, type TaskStatus } from '../types';
import styles from './StatusMenu.module.css';

/** The statuses a user picks, in menu order, with their shortcuts. */
export const PICKABLE_STATUSES = ['not-started', 'in-progress', 'completed'] as const;
export type PickableStatus = (typeof PICKABLE_STATUSES)[number];

/** The status the menu ticks: overdue is derived from the date, so it ticks Not started. */
function currentOf(status: TaskStatus): string {
  return status === 'overdue' ? 'not-started' : status;
}

export interface StatusMenuContentProps extends Omit<
  DropdownMenuContentProps,
  'children' | 'width' | 'onKeyDown'
> {
  /** the task's status; the matching item is ticked and highlighted */
  status: TaskStatus;
  /** called with the picked status (by click, Enter, or `1`, `2`, `3`) */
  onPick?: (status: PickableStatus) => void;
}

/**
 * The status menu's popup: a "Status" label, then Not started, In progress and Completed with
 * their icons. The current status is ticked; the others show their shortcut. Put it inside a
 * `DropdownMenu` (or use `StatusMenu`, which wires the trigger and the shortcuts' closing).
 */
export function StatusMenuContent({ status, onPick, className, ...props }: StatusMenuContentProps) {
  const current = currentOf(status);
  function onKeyDown(event: KeyboardEvent) {
    const index = ['1', '2', '3'].indexOf(event.key);
    if (index < 0) return;
    event.preventDefault();
    onPick?.(PICKABLE_STATUSES[index]);
  }
  return (
    <DropdownMenuContent
      aria-label="Status"
      className={cn(styles.content, className)}
      width="auto"
      onKeyDown={onKeyDown}
      {...props}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <Menu.RadioGroup
          value={current}
          onValueChange={(value: string) => onPick?.(value as PickableStatus)}
        >
          {PICKABLE_STATUSES.map((item, index) => (
            <Menu.RadioItem
              key={item}
              value={item}
              closeOnClick
              className={cn(menuItemVariants(), styles.item)}
            >
              <span className={styles.icon}>
                <StatusIcon status={item} />
              </span>
              <span className={menuStyles.itemLabel}>{TASK_STATUS_LABELS[item]}</span>
              {item === current ? (
                <Menu.RadioItemIndicator className={styles.tick} keepMounted>
                  <Icon icon={Check} />
                </Menu.RadioItemIndicator>
              ) : (
                <DropdownMenuShortcut>{index + 1}</DropdownMenuShortcut>
              )}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
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
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }
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
