import { useState, type KeyboardEvent, type ReactNode } from 'react';
import * as chrono from 'chrono-node';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import { Calendar } from '../Calendar';
import { Input } from '../Input';
import styles from './DatePicker.module.css';

export { styles as datePickerStyles };

export interface DatePickerQuickPick {
  label: ReactNode;
  date: Date;
}

/** Today, Tomorrow and Next week (the coming Monday), from `today`. */
export function defaultQuickPicks(today: Date): DatePickerQuickPick[] {
  const day = (offset: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const toMonday = (8 - today.getDay()) % 7 || 7;
  return [
    { label: 'Today', date: day(0) },
    { label: 'Tomorrow', date: day(1) },
    { label: 'Next week', date: day(toMonday) },
  ];
}

/**
 * Reads a typed date with chrono (https://github.com/wanasit/chrono), as chrono reads it, looking
 * forward from `today`: "tomorrow", "in 3 days", "next friday", "Jun 30" (this year, or next if
 * passed), "2027-01-05", and so on. A time typed with it is dropped: the day only.
 */
export function parseNaturalDate(text: string, today: Date = new Date()): Date | undefined {
  // from the start of today, so "tuesday" on a Tuesday reads the same all day
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const date = chrono.parseDate(text, from, { forwardDate: true });
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : undefined;
}

export interface DatePickerProps {
  /** the chosen date */
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  /** the day drawn as today (tests and stories pin it) */
  today?: Date;
  /** the month shown first; the value's month by default */
  defaultMonth?: Date;
  /** the natural-language field's hint */
  placeholder?: string;
  /** reads what was typed when Enter is pressed; `parseNaturalDate` by default */
  parse?: (text: string, today: Date) => Date | undefined;
  /** the pill buttons under the month; Today, Tomorrow and Next week by default, [] for none */
  quickPicks?: DatePickerQuickPick[];
  /** the "Time" row's control (a `Select` of times); left out without it */
  time?: ReactNode;
  /** "+ Add start date" in the footer: turns a due date into a range */
  onAddStart?: () => void;
  /** "Clear" in the footer */
  onClear?: () => void;
  className?: string;
}

/**
 * The date picker for a Start or Due date, as Figma's `DatePicker` (248px): a natural-language
 * field, the month (Calendar's `picker` variant) with quick picks, an optional time row, and a
 * footer with "+ Add start date" and "Clear". Put it in a `PopoverContent size="auto"`.
 */
export function DatePicker({
  value,
  onChange,
  today,
  defaultMonth,
  placeholder = 'Tomorrow, next Fri, Jun 30…',
  parse = parseNaturalDate,
  quickPicks,
  time,
  onAddStart,
  onClear,
  className,
}: DatePickerProps) {
  const [text, setText] = useState('');
  const now = today ?? new Date();
  const picks = quickPicks ?? defaultQuickPicks(now);
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    const date = parse(text, now);
    if (!date) return;
    event.preventDefault();
    setText('');
    onChange?.(date);
  }
  const hasFooter = onAddStart != null || onClear != null;
  return (
    <div className={cn(styles.panel, styles.single, className)}>
      <div className={styles.inputRow}>
        <Input
          value={text}
          placeholder={placeholder}
          aria-label="Date"
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className={styles.divider} />
      <div className={styles.calendar}>
        <Calendar
          variant="picker"
          mode="single"
          today={today}
          defaultMonth={defaultMonth ?? value ?? today}
          selected={value}
          onSelect={(date) => onChange?.(date)}
        />
        {picks.length > 0 && (
          <div className={styles.quickPicks}>
            {/* by place: two picks can share a day (on a Sunday, Tomorrow is Next week's Monday) */}
            {picks.map((pick, index) => (
              <Button
                key={index}
                size="xs"
                variant="outline"
                className={styles.quickPick}
                onClick={() => onChange?.(pick.date)}
              >
                {pick.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {time != null && (
        <>
          <div className={styles.divider} />
          <div className={styles.timeRow}>
            <span className={styles.meta}>Time</span>
            {time}
          </div>
        </>
      )}
      {hasFooter && (
        <>
          <div className={styles.divider} />
          <div className={styles.footer}>
            {onAddStart && (
              <Button size="xs" variant="ghost" icon={Plus} onClick={onAddStart}>
                Add start date
              </Button>
            )}
            {onClear && (
              <Button size="xs" variant="ghost" className={styles.end} onClick={onClear}>
                Clear
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
