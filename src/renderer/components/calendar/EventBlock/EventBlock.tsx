import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../../ui/ColourBar';
import { Icon } from '../../ui/Icon';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskStatus } from '@common/types';
import { cssColor, isSwatch, type Swatch } from '../../types';
import styles from './EventBlock.module.css';

/**
 * What a block on the time grid is: a calendar `event` (the calendar's colour bar), a `task`
 * scheduled on the grid (its status icon), or `focus` time (a neutral bar and a dashed outline).
 */
export type EventBlockKind = 'event' | 'task' | 'focus';

export const eventBlockVariants = cva(styles.block, {
  variants: {
    /** `compact` puts the title and time on one line, for blocks under about 40px (30 minutes) */
    size: { default: undefined, compact: styles.compact },
    kind: { event: undefined, task: styles.task, focus: styles.focus },
    /** you answered "maybe": a dashed outline at 70% */
    tentative: { true: styles.tentative },
  },
  defaultVariants: { size: 'default', kind: 'event' },
});

export interface EventBlockProps
  extends
    Omit<useRender.ComponentProps<'div'>, 'title'>,
    Omit<VariantProps<typeof eventBlockVariants>, 'tentative'> {
  title: string;
  /** "9:00 – 9:30 AM"; tentative events add " · Maybe" */
  time?: string;
  /** the calendar's colour: a swatch name or a CSS colour (`event` only) */
  color?: Swatch | string;
  /** a scheduled task's status (`task` only) */
  status?: TaskStatus;
  /** shows the video icon: the event has a meeting link */
  meeting?: boolean;
  tentative?: boolean;
}

/**
 * A block on the day and week grid: an event on its calendar's colour (15% over the page, the
 * outline at 30%) with its bar; a task or focus time on `muted` with a `border-strong` outline. Then
 * the title and time. The grid positions it
 * (`style={{ top, height }}`): 48px per hour, 2px shorter than its slot.
 */
export const EventBlock = forwardRef<HTMLDivElement, EventBlockProps>(function EventBlock(
  {
    title,
    time,
    color,
    status = TaskStatus.NOT_STARTED,
    meeting,
    size,
    kind,
    tentative,
    render,
    ...props
  },
  ref,
) {
  const k = kind ?? 'event';
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: eventBlockVariants({ size, kind: k, tentative: tentative ?? false }),
        // an event's calendar colour: its bar, and the tint of its ground and outline
        style: k === 'event' ? ({ '--event-color': cssColor(color) } as CSSProperties) : undefined,
        tabIndex: 0,
        'data-kind': k,
        children: (
          <>
            {/* think about this */}
            {k === 'task' ? (
              <StatusIcon status={status} size={12} className={styles.glyph} />
            ) : (
              <span className={styles.bar} />
            )}
            <div className={styles.body}>
              <div className={styles.title}>{title}</div>
              {(time != null || meeting) && (
                <div className={styles.time}>
                  {time != null && <span className={styles.timeText}>{time}</span>}
                  {meeting && <Icon icon={Video} size={12} label="Has a meeting link" />}
                </div>
              )}
            </div>
          </>
        ),
      } as object,
      props,
    ),
  });
});

export const allDayEventVariants = cva(styles.allDay, {
  variants: {
    /** `out-of-office`: a neutral `muted` chip with a grey bar and `muted-foreground` label */
    kind: { event: undefined, 'out-of-office': styles.outOfOffice, task: styles.allDayTask },
  },
  defaultVariants: { kind: 'event' },
});

export interface AllDayEventProps
  extends Omit<useRender.ComponentProps<'div'>, 'title'>, VariantProps<typeof allDayEventVariants> {
  title: string;
  /**
   * the calendar's colour: the chip is a swatch's 900 step (`swatch-*-tile`) with the full colour
   * bar; any other CSS colour (a synced calendar's `#rrggbb`) is mixed to the same strengths
   */
  color?: Swatch | string;
  /** a task's status (`task` only): its icon, and a closed task is struck through */
  status?: TaskStatus;
}

/**
 * An all-day event in the grid's all-day row: a 22px chip in the calendar's tile colour (its 15%
 * tint in the light theme) with its bar. Spans the days it covers; the grid positions it.
 */
export const AllDayEvent = forwardRef<HTMLDivElement, AllDayEventProps>(function AllDayEvent(
  { title, color = 'green', kind, status = TaskStatus.NOT_STARTED, render, ...props },
  ref,
) {
  const closed = status === TaskStatus.COMPLETED || status === TaskStatus.CANCELLED;
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(allDayEventVariants({ kind }), kind === 'task' && closed && styles.closed),
        tabIndex: 0,
        style: kind === 'task' ? undefined : chipColors(color),
        children: (
          <>
            {kind === 'task' ? (
              <StatusIcon status={status} size={12} />
            ) : (
              <ColourBar color={kind === 'out-of-office' ? 'var(--muted-foreground)' : color} />
            )}
            <span className={styles.chipTitle}>{title}</span>
          </>
        ),
      } as object,
      props,
    ),
  });
});

// a swatch's tile and tint tokens, or for another colour the same strengths mixed from it: the tile
// as 30% of the colour over the ground, the tint as the colour at 15% (as `swatch-*-tint` is)
function chipColors(color: Swatch | string): CSSProperties {
  return (
    isSwatch(color)
      ? {
          '--chip-color': `var(--swatch-${color}-tile)`,
          '--chip-tint': `var(--swatch-${color}-tint)`,
        }
      : {
          '--chip-color': `color-mix(in oklab, ${color} 30%, var(--background))`,
          '--chip-tint': `color-mix(in oklab, ${color} 15%, transparent)`,
        }
  ) as CSSProperties;
}

export const nowIndicatorVariants = cva(styles.now, {
  variants: { dot: { true: styles.withDot } },
  defaultVariants: { dot: true },
});

export interface NowIndicatorProps
  extends ComponentPropsWithoutRef<'div'>, VariantProps<typeof nowIndicatorVariants> {}

/** The red current-time line across today's column, its dot on the left; the grid positions it. */
export function NowIndicator({ dot, className, ...props }: NowIndicatorProps) {
  return (
    <div role="presentation" className={cn(nowIndicatorVariants({ dot }), className)} {...props} />
  );
}
