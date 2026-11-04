import { forwardRef, type ComponentProps, type CSSProperties } from 'react';
import { Progress } from '@base-ui/react/progress';
import { ChevronDown, ChevronRight, Circle, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import { ColourBar } from '../ColourBar';
import { Icon, renderIcon, type IconSource } from '../Icon';
import { isSwatch, resolveColor, swatchTintVar, type Swatch } from '../types';
import styles from './GroupHeading.module.css';

export interface GroupHeadingProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** the group's title: "Overdue", "Mitchell / Jesse 1:1", a project's name */
  label: string;
  /** "Oldest due Sep 28", "Event · Today, 10:00 AM" */
  subtitle?: string;
  /** the tile's icon (a Lucide icon or a node such as a StatusIcon); a circle by default */
  icon?: IconSource;
  /** the icon's colour: a swatch name or a CSS colour (`var(--status-overdue)`) */
  iconColor?: Swatch | string;
  /** an event's calendar colour, drawn as a bar in the tile instead of an icon */
  bar?: Swatch | string;
  /**
   * the tile's ground; defaults to the icon or bar colour at 15% (`swatch-*-tint` for a swatch).
   * Pass a `status-*-tint` token for status groups.
   */
  tint?: string;
  /** tasks done; with `total`, the count reads "done/total" and fills the bar */
  done?: number;
  total?: number;
  /** a count without progress (no bar) */
  count?: number;
  collapsed?: boolean;
  /** shows the chevron as a button that collapses or expands the group */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** the xs "Add task" button (hidden while collapsed) */
  onAddTask?: () => void;
}

function tintOf(tint: string | undefined, color: string | undefined): string | undefined {
  if (tint) return tint;
  if (!color) return undefined;
  if (isSwatch(color)) return swatchTintVar(color);
  return `color-mix(in oklab, ${color} 15%, transparent)`;
}

/**
 * A group in the grouped list: a chevron, a tinted tile, the title over a subtitle, an xs "Add
 * task" button, done/total and an 80px progress bar. `group-gap` of space above it, no band.
 */
export const GroupHeading = forwardRef<HTMLDivElement, GroupHeadingProps>(function GroupHeading(
  {
    label,
    subtitle,
    icon = Circle,
    iconColor,
    bar,
    tint,
    done,
    total: totalProp,
    count,
    collapsed = false,
    onCollapsedChange,
    onAddTask,
    className,
    style,
    ...props
  },
  ref,
) {
  const total = totalProp ?? count;
  const color = resolveColor(bar ?? iconColor);
  const vars = {
    ...(color && { '--group-color': color }),
    ...(tintOf(tint, bar ?? iconColor) && { '--group-tint': tintOf(tint, bar ?? iconColor) }),
  } as CSSProperties;
  const chevron = <Icon icon={collapsed ? ChevronRight : ChevronDown} size={14} />;

  return (
    <div
      ref={ref}
      role="heading"
      aria-level={3}
      data-collapsed={collapsed ? '' : undefined}
      className={cn(styles.heading, className)}
      style={{ ...vars, ...style }}
      {...props}
    >
      {onCollapsedChange ? (
        <button
          type="button"
          className={styles.chevron}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {chevron}
        </button>
      ) : (
        <span className={styles.chevron} aria-hidden>
          {chevron}
        </span>
      )}
      <span className={styles.tile} aria-hidden>
        {bar ? <ColourBar color={bar} height={14} /> : renderIcon(icon, 16)}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      {collapsed ? (
        <span />
      ) : (
        <Button variant="ghost" size="xs" icon={Plus} onClick={onAddTask}>
          Add task
        </Button>
      )}
      {total != null ? (
        <span className={styles.count}>{done != null ? `${done}/${total}` : total}</span>
      ) : (
        <span />
      )}
      {total && done != null ? (
        <Progress.Root
          value={done ?? 0}
          max={total}
          aria-label={`${label}: ${done ?? 0} of ${total} done`}
        >
          <Progress.Track className={styles.progress}>
            <Progress.Indicator className={styles.indicator} />
          </Progress.Track>
        </Progress.Root>
      ) : (
        <span />
      )}
    </div>
  );
});
