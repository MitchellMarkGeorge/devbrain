import type { ReactNode } from 'react';
import type { DateRange as DayRange } from 'react-day-picker';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import { Calendar } from '../Calendar';
import { datePickerStyles } from '../DatePicker';
import { Icon } from '../Icon';
import styles from './DateRangePicker.module.css';

export type DateRangeValue = DayRange;
export type DateRangeEnd = 'start' | 'due';

const fmt = (date: Date | undefined) =>
  date?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Days from start to due, both counted: Jun 22 → Jul 1 is 10 days. */
export function rangeLength(range: DayRange | undefined): number | undefined {
  if (!range?.from || !range.to) return undefined;
  const day = 24 * 60 * 60 * 1000;
  const from = Date.UTC(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const to = Date.UTC(range.to.getFullYear(), range.to.getMonth(), range.to.getDate());
  return Math.round((to - from) / day) + 1;
}

export interface DateRangePickerProps {
  /** `from` is the start date, `to` the due date */
  value?: DayRange;
  onChange?: (range: DayRange | undefined) => void;
  /** the end being picked: its field takes the `ring` outline */
  active?: DateRangeEnd;
  onActiveChange?: (end: DateRangeEnd) => void;
  today?: Date;
  /** the first of the two months shown; the start's month by default */
  defaultMonth?: Date;
  /** "Clear" in the footer */
  onClear?: () => void;
  /** the footer's summary; "10 days" by default */
  summary?: ReactNode;
  className?: string;
}

/**
 * The start and due range picker, as Figma's `DateRangePicker` (496px): Start → Due fields, two
 * months side by side (no outside days) with the range's ends on `secondary` and the days between
 * on `accent`, and a footer with the range's length and "Clear". Put it in a
 * `PopoverContent size="auto"`.
 */
export function DateRangePicker({
  value,
  onChange,
  active = 'start',
  onActiveChange,
  today,
  defaultMonth,
  onClear,
  summary,
  className,
}: DateRangePickerProps) {
  const length = rangeLength(value);
  const field = (end: DateRangeEnd, label: string, date: Date | undefined) => (
    <button
      type="button"
      className={styles.field}
      data-active={active === end || undefined}
      aria-pressed={active === end}
      onClick={() => onActiveChange?.(end)}
    >
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{fmt(date) ?? 'None'}</span>
    </button>
  );
  return (
    <div className={cn(datePickerStyles.panel, styles.picker, className)}>
      <div className={styles.fields}>
        {field('start', 'Start', value?.from)}
        <Icon icon={ArrowRight} className={styles.arrow} />
        {field('due', 'Due', value?.to)}
      </div>
      <div className={datePickerStyles.divider} />
      <div className={datePickerStyles.calendar}>
        <Calendar
          variant="picker"
          mode="range"
          numberOfMonths={2}
          showOutsideDays={false}
          today={today}
          defaultMonth={defaultMonth ?? value?.from ?? value?.to ?? today}
          selected={value}
          onSelect={onChange}
        />
      </div>
      <div className={datePickerStyles.divider} />
      <div className={cn(datePickerStyles.footer, styles.footer)}>
        <span className={datePickerStyles.meta}>
          {summary ?? (length != null && `${length} ${length === 1 ? 'day' : 'days'}`)}
        </span>
        {onClear && (
          <Button size="xs" variant="ghost" className={datePickerStyles.end} onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
