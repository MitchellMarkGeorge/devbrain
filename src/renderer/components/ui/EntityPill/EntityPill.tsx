import { forwardRef } from 'react';
import { CornerDownRight, FileText, Folder } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge, type BadgeProps } from '../Badge';
import { ColourBar } from '../ColourBar';
import { Icon, type IconSource } from '../Icon';
import { StatusIcon } from '../StatusIcon';
import type { Swatch, TaskStatus } from '../types';
import styles from './EntityPill.module.css';

export type EntityType = 'project' | 'note' | 'task' | 'event' | 'parent';

export interface EntityPillProps extends Omit<
  BadgeProps,
  'variant' | 'icon' | 'iconColor' | 'barColor' | 'muted'
> {
  /**
   * what the pill links to, which picks its glyph: `project` folder (in `color`), `note` file,
   * `task` its status icon, `parent` a subtask's parent (corner arrow, then its status icon),
   * `event` a bar in the calendar's colour. Leave it out for a property value and pass `glyph`.
   */
  type?: EntityType;
  /** a project's folder or an event's bar: a swatch name or a CSS colour */
  color?: Swatch | string;
  /** the linked task's status (`task`, `parent`); in progress by default */
  status?: TaskStatus;
  /** a property value's own glyph (status, priority, date, progress, "+"): replaces the type's */
  glyph?: IconSource;
}

/**
 * The outlined pill every relation and property uses (rows, the property rows of detail pages,
 * note headers). A button that opens the linked item; pointing at it fills it with
 * `pill-fill-hover` and lifts the label from `muted-foreground` to `foreground`.
 * Wrap it in an EntityHoverCard trigger for the preview.
 */
export const EntityPill = forwardRef<HTMLElement, EntityPillProps>(function EntityPill(
  { type, color, status = 'in-progress', glyph, className, ...props },
  ref,
) {
  const icon =
    glyph ??
    (type === 'project' ? (
      Folder
    ) : type === 'note' ? (
      FileText
    ) : type === 'task' ? (
      <StatusIcon status={status} size={12} />
    ) : type === 'parent' ? (
      <>
        <Icon icon={CornerDownRight} size={12} className={styles.arrow} />
        <StatusIcon status={status} size={12} />
      </>
    ) : type === 'event' ? (
      <ColourBar color={color ?? 'green'} />
    ) : undefined);
  return (
    <Badge
      ref={ref}
      variant="outline"
      interactive
      muted
      icon={icon}
      iconColor={type === 'project' ? color : undefined}
      data-entity={type}
      className={cn(styles.pill, type === 'project' && color && styles.project, className)}
      {...props}
    />
  );
});
