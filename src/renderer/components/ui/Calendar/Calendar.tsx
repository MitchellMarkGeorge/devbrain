import { DayPicker, type ChevronProps, type DayPickerProps } from 'react-day-picker';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Icon } from '../Icon';
import styles from './Calendar.module.css';

export type CalendarProps = DayPickerProps;

const CHEVRONS = { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown };

function Chevron({ orientation = 'left' }: ChevronProps) {
  return <Icon icon={CHEVRONS[orientation]} size={14} />;
}

/**
 * The mini calendar (react-day-picker; Base UI has no calendar): weeks from Monday, one-letter
 * weekdays, 28px cells, today on the `now-indicator` red and the selected day on `secondary`.
 * Put it in a Base UI `Popover` for a date picker.
 */
export function Calendar({ className, classNames, formatters, ...props }: CalendarProps) {
  return (
    <DayPicker
      weekStartsOn={1}
      showOutsideDays
      className={className}
      classNames={{
        root: styles.root,
        months: styles.months,
        month: styles.month,
        month_caption: styles.caption,
        caption_label: styles.captionLabel,
        nav: styles.nav,
        button_previous: styles.navButton,
        button_next: styles.navButton,
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
      components={{ Chevron, ...props.components }}
      {...props}
    />
  );
}
