import { Children, forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import {
  CalendarClock,
  ChevronsUp,
  CornerDownRight,
  Folder,
  GitPullRequest,
  Plus,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../../ui/DropdownMenu';
import { DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { EntityPill } from '../../entities/EntityPill';
import type { IconSource } from '../../ui/Icon';
import styles from './PropertyRow.module.css';

/** A property the "+ Add" menu offers while it is unset. */
export interface PropertyRowAddItem {
  /** passed to `onAdd`: `'priority'`, `'project'`, … */
  key: string;
  label: string;
  icon?: IconSource;
}

/** What a task can add, in menu order. Pass only the unset ones as `addItems`. */
export const TASK_ADD_ITEMS: PropertyRowAddItem[] = [
  { key: 'priority', label: 'Priority', icon: ChevronsUp },
  { key: 'project', label: 'Project', icon: Folder },
  { key: 'parent', label: 'Parent task', icon: CornerDownRight },
  { key: 'event', label: 'Event', icon: CalendarClock },
  { key: 'pull-request', label: 'Pull request', icon: GitPullRequest },
];

export interface PropertyRowProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * the first line, as `EntityPill`s that open their pickers. Tasks: status, priority,
   * `DateRange`, project. Projects: status, `DateRange`, progress.
   */
  properties: ReactNode;
  /**
   * the second line, links to other items with no prefix: the `SyncedBadge` first, then the
   * event, the parent task and the pull request. No links and no `note`: no second line.
   */
  links?: ReactNode;
  /** a quiet note ending the links line: "Synced 3 min ago", "Edits stay in DevBrain" */
  note?: ReactNode;
  /**
   * ends the first line in a muted "+ Add" pill. `false` for synced tasks, whose fields come
   * from the provider. True by default.
   */
  addable?: boolean;
  /** the properties still unset, which the "+ Add" menu offers; no items, no pill */
  addItems?: PropertyRowAddItem[];
  /** called with the picked item's `key` */
  onAdd?: (key: string) => void;
}

/**
 * The pill rows under a task or project title, in place of a side Properties card: properties
 * on the first line, ending in "+ Add"; links on the second. Both lines wrap.
 */
export const PropertyRow = forwardRef<HTMLDivElement, PropertyRowProps>(function PropertyRow(
  {
    properties,
    links,
    note,
    addable = true,
    addItems = TASK_ADD_ITEMS,
    onAdd,
    className,
    ...props
  },
  ref,
) {
  const hasLinks = Children.toArray(links).length > 0;
  return (
    <div ref={ref} className={cn(styles.rows, className)} {...props}>
      <div className={styles.line} role="group" aria-label="Properties">
        {properties}
        {addable && addItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<EntityPill glyph={Plus} aria-label="Add property" />}>
              Add
            </DropdownMenuTrigger>
            <DropdownMenuContent width="sm">
              {addItems.map((item) => (
                <DropdownMenuItem key={item.key} icon={item.icon} onClick={() => onAdd?.(item.key)}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {(hasLinks || note != null) && (
        <div className={styles.line} role="group" aria-label="Links">
          {links}
          {note != null && <span className={styles.note}>{note}</span>}
        </div>
      )}
    </div>
  );
});
