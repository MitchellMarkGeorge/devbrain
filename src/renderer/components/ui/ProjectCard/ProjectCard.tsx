import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { Folder } from 'lucide-react';
import { cn } from '../../lib/cn';
import { cardVariants } from '../Card';
import { EntityPill } from '../EntityPill';
import { Icon } from '../Icon';
import { Progress } from '../Progress';
import { PROJECT_STATUS_LABELS, ProjectStatusIcon, type ProjectStatus } from '../ProjectStatusIcon';
import { resolveColor, type Swatch } from '../types';
import styles from './ProjectCard.module.css';

export interface ProjectCardProps extends Omit<useRender.ComponentProps<'div'>, 'title'> {
  name: string;
  /** the project's colour: its folder */
  color?: Swatch;
  /** "Due Jul 1" */
  due?: ReactNode;
  /** tasks done and in all: the bar, "25%" and "3 of 12 tasks done" */
  done: number;
  total: number;
  status: ProjectStatus;
  /** the status pill: a StatusMenu trigger, or the pill itself (defaults to an EntityPill) */
  statusPill?: ReactNode;
}

/**
 * A project as a card (Projects, cards view): the folder in the project's colour, its name and due
 * date, one progress bar of tasks done, and the status pill. Opens the project on click
 * (`render={<a href=… />}` for a link). Lay cards out in a `Grid minColumnWidth="300px"` with 16px
 * gaps.
 */
export const ProjectCard = forwardRef<HTMLDivElement, ProjectCardProps>(function ProjectCard(
  { name, color = 'blue', due, done, total, status, statusPill, render, ...props },
  ref,
) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(cardVariants(), styles.card),
        tabIndex: 0,
        style: { '--project-color': resolveColor(color) } as CSSProperties,
        children: (
          <>
            <div className={styles.head}>
              <Icon icon={Folder} size={16} className={styles.folder} />
              <span className={styles.name}>{name}</span>
              {due != null && <span className={styles.due}>{due}</span>}
            </div>
            <div className={styles.progress}>
              <div className={styles.numbers}>
                <span className={styles.percent}>{percent}%</span>
                <span className={styles.count}>
                  {done} of {total} tasks done
                </span>
              </div>
              <Progress value={percent} aria-label={`${name}: ${done} of ${total} tasks done`} />
            </div>
            <div className={styles.foot}>
              {statusPill ?? (
                <EntityPill glyph={<ProjectStatusIcon status={status} size={12} />}>
                  {PROJECT_STATUS_LABELS[status]}
                </EntityPill>
              )}
            </div>
          </>
        ),
      } as object,
      props,
    ),
  });
});
