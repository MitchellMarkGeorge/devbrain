import { forwardRef, type ComponentProps, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Circle, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../../ui/ColourBar';
import { Icon, renderIcon, type IconSource } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { cssColor, type Swatch } from '../../types';
import styles from './GroupHeading.module.css';

export interface GroupHeadingProps extends Omit<ComponentProps<'div'>, 'children' | 'color'> {
  /** the group's title: "Overdue", "Mitchell / Jesse 1:1", a project's name */
  label: string;
  /** muted text after the title, for an event's time ("Today, 10:00 AM"); keep it short */
  subtitle?: string;
  /** the group's icon (a Lucide icon or a node such as a StatusIcon); a circle by default */
  icon?: IconSource;
  /**
   * the group's colour: a swatch name or a CSS colour (`var(--status-overdue)`). It tints the band
   * (8% over `muted`) and colours a Lucide icon. Leave it out for a neutral group (Not started,
   * No priority, a note).
   */
  color?: Swatch | string;
  /** an event's calendar colour, drawn as a bar instead of an icon; it tints the band too */
  bar?: Swatch | string;
  /** how many items the group holds */
  count?: number;
  collapsed?: boolean;
  /** shows the chevron as a button that collapses or expands the group */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** the "+" at the far right, shown while the band is hovered or focused (hidden while collapsed) */
  onAddTask?: () => void;
}

/**
 * A group in the grouped list: a 36px band (`muted`, tinted 8% with the group's colour) with a
 * chevron, a 14px icon in that colour, the title, an optional muted subtitle and the count, and a
 * "+" on hover. In a grouped `TaskList` it sticks to the top of the list while its group scrolls.
 */
export const GroupHeading = forwardRef<HTMLDivElement, GroupHeadingProps>(function GroupHeading(
  {
    label,
    subtitle,
    icon = Circle,
    color: groupColor,
    bar,
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
  const color = cssColor(bar ?? groupColor);
  const vars = (color ? { '--group-color': color } : {}) as CSSProperties;
  const chevron = <Icon icon={collapsed ? ChevronRight : ChevronDown} size={14} />;

  return (
    <div
      ref={ref}
      role="heading"
      aria-level={3}
      data-collapsed={collapsed ? '' : undefined}
      data-tinted={color ? '' : undefined}
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
      <span className={styles.icon} aria-hidden>
        {bar ? <ColourBar color={bar} height={12} /> : renderIcon(icon, 14)}
      </span>
      <span className={styles.label}>{label}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      {count != null && <span className={styles.count}>{count}</span>}
      {onAddTask && !collapsed && (
        <IconButton
          className={styles.add}
          icon={Plus}
          label={`Add task to ${label}`}
          size="xs"
          tone="muted"
          tooltip="Add task"
          onClick={onAddTask}
        />
      )}
    </div>
  );
});
