import { forwardRef } from 'react';
import { CornerDownRight, FileText, Folder } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge, type BadgeProps } from '../../ui/Badge';
import { ColourBar } from '../../ui/ColourBar';
import { Icon, type IconSource } from '../../ui/Icon';
import { StatusIcon } from '../StatusIcon';
import type { EventSummary, NoteSummary, ProjectSummary, TaskSummary } from '@common/types';
import { resolveColor } from '../../types';
import styles from './EntityPill.module.css';

export type EntityType = 'project' | 'note' | 'task' | 'event' | 'parent';

/**
 * What a pill links to: core's summary of it (`ProjectSummary`, `EventSummary`, `NoteSummary`,
 * `TaskSummary`) with its `type`. A task's or note's `link` is one as it is
 * (`entity={task.link}`); a project or parent task gets its type:
 * `entity={{ type: 'project', ...task.project }}`. `parent` is a subtask's parent task.
 */
export type PillEntity =
  | ({ type: 'project' } & Pick<ProjectSummary, 'title' | 'color'>)
  | ({ type: 'event' } & Pick<EventSummary, 'title' | 'color'>)
  | ({ type: 'note' } & Pick<NoteSummary, 'title'>)
  | ({ type: 'task' | 'parent' } & Pick<TaskSummary, 'title' | 'status'>);

export interface EntityPillProps extends Omit<
  BadgeProps,
  'variant' | 'icon' | 'iconColor' | 'barColor' | 'muted'
> {
  /**
   * the item it links to, which picks its glyph and is its label: `project` folder (in its
   * colour), `note` file, `task` its status icon, `parent` a corner arrow then its status icon,
   * `event` a bar in its colour (green when it has none). Leave it out for a property value and
   * pass `glyph` and the label.
   */
  entity?: PillEntity;
  /** a property value's own glyph (status, priority, date, progress, "+"): replaces the entity's */
  glyph?: IconSource;
}

function glyphOf(entity: PillEntity): IconSource {
  switch (entity.type) {
    case 'project':
      return Folder;
    case 'note':
      return FileText;
    case 'task':
      return <StatusIcon status={entity.status} size={12} />;
    case 'parent':
      return (
        <>
          <Icon icon={CornerDownRight} size={12} className={styles.arrow} />
          <StatusIcon status={entity.status} size={12} />
        </>
      );
    case 'event':
      return <ColourBar color={resolveColor(entity.color, 'green')} />;
  }
}

/**
 * The outlined pill every relation and property uses (rows, the property rows of detail pages,
 * note headers). A button that opens the linked item; pointing at it fills it with
 * `pill-fill-hover` and lifts the label from `muted-foreground` to `foreground`.
 * Wrap it in an EntityHoverCard trigger for the preview.
 */
export const EntityPill = forwardRef<HTMLElement, EntityPillProps>(function EntityPill(
  { entity, glyph, className, children, ...props },
  ref,
) {
  const type = entity?.type;
  const projectColor = entity?.type === 'project' ? resolveColor(entity.color) : undefined;
  return (
    <Badge
      ref={ref}
      variant="outline"
      interactive
      muted
      icon={glyph ?? (entity && glyphOf(entity))}
      iconColor={projectColor}
      data-entity={type}
      className={cn(styles.pill, projectColor && styles.project, className)}
      {...props}
    >
      {children ?? entity?.title}
    </Badge>
  );
});
