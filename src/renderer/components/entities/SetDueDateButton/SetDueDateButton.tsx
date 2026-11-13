import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFormat } from '../../lib/format';
import styles from './SetDueDateButton.module.css';
import { DatePicker } from '../../ui/DatePicker';
import { Button } from '../../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';

export interface SetDueDateButtonProps {
  /** a date was picked */
  onDueDateChange: (date: Date) => void;
  /** opens the picker at first (pictures) */
  defaultOpen?: boolean;
  className?: string;
  /**
   * -1 inside a row or card that is itself the tab stop (`TaskRow`, `BoardCard`), so Tab leaves
   * the list rather than walking every undated task's button
   */
  tabIndex?: number;
}

/**
 * What a task without a due date shows in its date slot (a `TaskRow`, a `BoardCard`): a quiet 24px
 * ghost button, a calendar-plus and "Due" (named "Set due date"), opening the `DatePicker`. Its row or card shows it only
 * while pointed at or focused, so an undated task reads as a blank slot at rest; the button stays
 * while its picker is open (`data-popup-open`).
 */
export function SetDueDateButton({
  onDueDateChange,
  defaultOpen = false,
  className,
  tabIndex,
}: SetDueDateButtonProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { now } = useFormat();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            icon={CalendarPlus}
            aria-label="Set due date"
            className={cn(styles.button, className)}
            tabIndex={tabIndex}
            data-set-due=""
          >
            Due
          </Button>
        }
      />
      <PopoverContent size="auto" align="end" aria-label="Due date">
        <DatePicker
          today={now}
          onChange={(date) => {
            if (date) onDueDateChange(date);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
