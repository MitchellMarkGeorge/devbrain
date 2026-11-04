import type { ComponentProps } from 'react';
import { DayPicker, type ChevronProps, type DayPickerProps, type DayProps } from 'react-day-picker';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../Icon';
import styles from './Calendar.module.css';

export type CalendarProps = DayPickerProps & {
  /**
   * `mini` (the calendar sidebar): the month on the left, ‹ › at the right. `picker` (date
   * pickers): ‹ month › with the month centred, the arrows around one month or a pair.
   */
  variant?: 'mini' | 'picker';
};

const CHEVRONS = { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown };

function Chevron({ orientation = 'left' }: ChevronProps) {
  return <Icon icon={CHEVRONS[orientation]} size={12} />;
}

// a calendar without `mode` draws its days as text: give them the button's square all the same
function Day(props: DayProps) {
  // `day` and `modifiers` are DayPicker's, not the cell's
  const { children, ...rest } = props;
  const cell = { ...rest } as Partial<DayProps>;
  delete cell.day;
  delete cell.modifiers;
  const text = typeof children === 'string' || typeof children === 'number';
  return (
    <td {...(cell as ComponentProps<'td'>)}>
      {text ? <span className={styles.dayButton}>{children}</span> : children}
    </td>
  );
}

/**
 * The calendar (react-day-picker; Base UI has no calendar), drawn as Figma's MiniCalendar: weeks
 * from Monday, one-letter weekdays, 12px numerals in 28px cells, today on the `now-indicator`
 * red, the selected day (and a range's ends) on `secondary` with a `border-strong` outline, a
 * range's days between on `accent`.
 */
export function Calendar({
  variant = 'mini',
  className,
  classNames,
  formatters,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      weekStartsOn={1}
      showOutsideDays
      navLayout={variant === 'picker' ? 'around' : undefined}
      className={className}
      classNames={{
        root: cn(styles.root, variant === 'picker' && styles.picker),
        months: styles.months,
        month: styles.month,
        month_caption: styles.caption,
        caption_label: styles.captionLabel,
        nav: styles.nav,
        button_previous: cn(styles.navButton, styles.previous),
        button_next: cn(styles.navButton, styles.next),
        month_grid: styles.grid,
        weekday: styles.weekday,
        day: styles.day,
        day_button: styles.dayButton,
        outside: styles.outside,
        disabled: styles.disabled,
        hidden: styles.hidden,
        selected: styles.selected,
        range_start: styles.rangeStart,
        range_end: styles.rangeEnd,
        range_middle: styles.rangeMiddle,
        today: styles.today,
        ...classNames,
      }}
      formatters={{
        formatWeekdayName: (date) => date.toLocaleDateString(undefined, { weekday: 'narrow' }),
        ...formatters,
      }}
      components={{ Chevron, Day, ...props.components }}
      {...props}
    />
  );
}
