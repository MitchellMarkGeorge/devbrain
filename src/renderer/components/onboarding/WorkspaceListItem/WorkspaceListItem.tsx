import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { WorkspaceTile } from '../../entities/WorkspaceTile';
import type { Swatch } from '../../types';
import styles from './WorkspaceListItem.module.css';

export interface WorkspaceListItemProps extends ComponentPropsWithoutRef<'button'> {
  /** the workspace's name; its first letter goes on the 32px tile */
  name: string;
  color?: Swatch;
  /** the second line: "Last opened 2 days ago", or the folder's path */
  detail?: ReactNode;
  /** the quiet note at the right: "Created Mar 2026", or when it was last opened */
  meta?: ReactNode;
}

/**
 * A recent workspace on the Welcome screen: the 32px tile, the name over a quiet line, and a note
 * at the right. A 52px button; hover fills it and shows an arrow. Stack them in a `WorkspaceList`.
 */
export const WorkspaceListItem = forwardRef<HTMLButtonElement, WorkspaceListItemProps>(
  function WorkspaceListItem({ name, color, detail, meta, className, ...props }, ref) {
    return (
      <button ref={ref} type="button" className={cn(styles.item, className)} {...props}>
        <WorkspaceTile letter={name} color={color} size={32} className={styles.tile} />
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          {detail && <span className={styles.detail}>{detail}</span>}
        </span>
        {meta && <span className={styles.meta}>{meta}</span>}
        <Icon icon={ArrowRight} size={16} className={styles.arrow} />
      </button>
    );
  },
);

export interface WorkspaceListProps extends ComponentPropsWithoutRef<'div'> {
  /** the card's label: "Recent workspaces" */
  label?: ReactNode;
}

/** The Welcome screen's card of recent workspaces: a 12px label, then the items 2px apart. */
export const WorkspaceList = forwardRef<HTMLDivElement, WorkspaceListProps>(function WorkspaceList(
  { label, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} role="group" className={cn(styles.list, className)} {...props}>
      {label && <div className={styles.label}>{label}</div>}
      {children}
    </div>
  );
});
