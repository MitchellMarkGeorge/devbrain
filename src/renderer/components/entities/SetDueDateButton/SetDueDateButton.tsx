import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { useFormat } from '../../lib/format';
import { DatePicker } from '../../ui/DatePicker';
import { IconButton } from '../../ui/IconButton';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';

export interface SetDueDateButtonProps {
  /** a date was picked */
  onDueDateChange: (date: Date) => void;
  /** opens the picker at first (pictures) */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * What a task without a due date shows in its date slot (a `TaskRow`, a `BoardCard`): a quiet 24px
 * calendar-plus button, "Set due date", opening the `DatePicker`. Its row or card shows it only
 * while pointed at or focused, so an undated task reads as a blank slot at rest; the button stays
 * while its picker is open (`data-popup-open`).
 */
export function SetDueDateButton({
  onDueDateChange,
  defaultOpen = false,
  className,
}: SetDueDateButtonProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { now } = useFormat();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <IconButton
            size="xs"
            tone="muted"
            icon={CalendarPlus}
            label="Set due date"
            className={className}
            data-set-due=""
          />
        }
      />
      <PopoverContent size="auto" align="end">
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
