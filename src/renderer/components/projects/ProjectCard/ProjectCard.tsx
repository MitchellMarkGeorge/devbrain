import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { Folder } from 'lucide-react';
import { cn } from '../../lib/cn';
import { cardVariants } from '../../ui/Card';
import { EntityPill } from '../../entities/EntityPill';
import { Icon } from '../../ui/Icon';
import { Progress } from '../../ui/Progress';
import type { Project, ProjectStats } from '@common/types';
import { PROJECT_STATUS_LABELS, ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { useFormat } from '../../lib/format';
import { projectDateText } from '../../project-text';
import { percentOf, resolveColor } from '../../types';
import styles from './ProjectCard.module.css';

/** The fields of core's `Project` a project card reads; pass the project as it is. */
export type ProjectCardData = Pick<
  Project,
  'title' | 'color' | 'status' | 'dueDate' | 'completedAt'
>;

export interface ProjectCardProps extends Omit<useRender.ComponentProps<'div'>, 'title'> {
  /** core's project: its name, folder colour (blue without one), status and due date */
  project: ProjectCardData;
  /** its tasks done, from `projects.stats`: the bar, "25%" and "3 of 12 tasks done" */
  stats?: Pick<ProjectStats, 'numOfCompleted' | 'totalTasks'>;
  /** the status pill: a StatusMenu trigger, or the pill itself (defaults to an EntityPill) */
  statusPill?: ReactNode;
}

/**
 * A project as a card (Projects, cards view), drawn from core's `Project` and its stats: the folder
 * in the project's colour, its name and due date ("Due Jul 1", "Done Jun 12"), one progress bar of
 * tasks done, and the status pill. Opens the project on click
 * (`render={<a href=… />}` for a link). Lay cards out in a `Grid minColumnWidth="300px"` with 16px
 * gaps.
 */
export const ProjectCard = forwardRef<HTMLDivElement, ProjectCardProps>(function ProjectCard(
  { project, stats, statusPill, render, ...props },
  ref,
) {
  const format = useFormat();
  const { title: name, status } = project;
  const done = stats?.numOfCompleted ?? 0;
  const total = stats?.totalTasks ?? 0;
  const percent = percentOf(done, total);
  const due = projectDateText(project, format);
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(cardVariants(), styles.card),
        tabIndex: 0,
        style: { '--project-color': resolveColor(project.color, 'blue') } as CSSProperties,
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
