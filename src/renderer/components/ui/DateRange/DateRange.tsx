import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ArrowRight, Calendar as CalendarIcon, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EntityPill } from '../EntityPill';
import { Icon } from '../Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import styles from './DateRange.module.css';

export interface DateRangeProps extends ComponentPropsWithoutRef<'span'> {
  /** the start date ("Jun 24"); leave it out to show the due date with a "+ Start date" pill */
  start?: ReactNode;
  /** the due date ("Jul 1") */
  due: ReactNode;
  /** colours the due date's glyph: `today` or `overdue` */
  dueTone?: 'today' | 'overdue';
  /** the due date picker (a `DatePicker`): the due pill opens it in a popover */
  duePicker?: ReactNode;
  /**
   * the start and due range picker (a `DateRangePicker`): the start pill (or "+ Start date") opens
   * it, anchored under the start pill
   */
  startPicker?: ReactNode;
  /** "+ Start date" without a picker: called on click */
  onAddStart?: () => void;
}

/** "Due date, Jul 1" for a string date; otherwise the pill's own text names it */
function labelled(name: string, value: ReactNode): string | undefined {
  return typeof value === 'string' ? `${name}, ${value}` : undefined;
}

/** A date pill that opens its picker when it has one. */
function DatePill({ picker, pill }: { picker: ReactNode | undefined; pill: ReactElement }) {
  if (picker == null) return pill;
  return (
    <Popover>
      <PopoverTrigger render={pill} />
      <PopoverContent size="auto" className={styles.picker}>
        {picker}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The dates property: one value until a start date exists (the due date and a muted
 * "+ Start date" pill), then two pills, start → due, each opening its own picker.
 */
export const DateRange = forwardRef<HTMLSpanElement, DateRangeProps>(function DateRange(
  { start, due, dueTone, duePicker, startPicker, onAddStart, className, ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn(styles.range, className)} {...props}>
      {start != null && (
        <>
          <DatePill
            picker={startPicker}
            pill={
              <EntityPill glyph={CalendarIcon} aria-label={labelled('Start date', start)}>
                {start}
              </EntityPill>
            }
          />
          <Icon icon={ArrowRight} size={14} className={styles.arrow} />
        </>
      )}
      <DatePill
        picker={duePicker}
        pill={
          <EntityPill
            glyph={CalendarIcon}
            className={dueTone && styles[dueTone]}
            aria-label={labelled('Due date', due)}
          >
            {due}
          </EntityPill>
        }
      />
      {start == null && (
        <DatePill
          picker={startPicker}
          pill={
            <EntityPill glyph={Plus} onClick={onAddStart}>
              Start date
            </EntityPill>
          }
        />
      )}
    </span>
  );
});
