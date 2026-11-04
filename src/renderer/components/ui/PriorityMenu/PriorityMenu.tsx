import type { ReactElement } from 'react';
import { DropdownMenu, DropdownMenuTrigger } from '../DropdownMenu';
import { PriorityIcon } from '../PriorityIcon';
import {
  usePickerOpen,
  ValueMenuContent,
  type ValueMenuContentProps,
  type ValueMenuOption,
} from '../StatusMenu';
import { PRIORITY_LABELS, type Priority } from '../types';

const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];
// ⇧1, ⇧2, ⇧3 arrive as the shifted characters on a US layout
const SHIFTED = ['!', '@', '#'];

const PRIORITY_OPTIONS: ValueMenuOption<Priority>[] = PRIORITIES.map((priority, index) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
  icon: <PriorityIcon priority={priority} />,
  key: SHIFTED[index],
  shortcut: `⇧${index + 1}`,
}));

export interface PriorityMenuContentProps extends Omit<
  ValueMenuContentProps<Priority>,
  'label' | 'options' | 'value'
> {
  /** the task's priority; the matching item is ticked and highlighted */
  priority: Priority | undefined;
}

/**
 * The priority menu's popup: a "Priority" label, then High, Medium and Low with their
 * `PriorityIcon`s. The current priority is ticked; the others show ⇧1, ⇧2, ⇧3.
 */
export function PriorityMenuContent({ priority, ...props }: PriorityMenuContentProps) {
  return (
    <ValueMenuContent label="Priority" options={PRIORITY_OPTIONS} value={priority} {...props} />
  );
}

export interface PriorityMenuProps {
  priority: Priority | undefined;
  onPriorityChange?: (priority: Priority) => void;
  /** the element that opens the menu: a priority badge or icon button */
  trigger: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: PriorityMenuContentProps['side'];
  align?: PriorityMenuContentProps['align'];
}

/** A priority trigger and the menu it opens; picking (or ⇧1–⇧3) sets it and closes the menu. */
export function PriorityMenu({
  priority,
  onPriorityChange,
  trigger,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  side,
  align,
}: PriorityMenuProps) {
  const [open, setOpen] = usePickerOpen(openProp, defaultOpen, onOpenChange);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={trigger} />
      <PriorityMenuContent
        priority={priority}
        side={side}
        align={align}
        onPick={(picked) => {
          onPriorityChange?.(picked);
          setOpen(false);
        }}
      />
    </DropdownMenu>
  );
}
