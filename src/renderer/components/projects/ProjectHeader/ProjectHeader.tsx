import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { DateRange } from '../../detail/DateRange';
import { EntityPill } from '../../entities/EntityPill';
import { ProgressRing } from '../../ui/ProgressRing';
import {
  PROJECT_STATUS_LABELS,
  ProjectStatusIcon,
  type ProjectStatus,
} from '../../entities/ProjectStatusIcon';
import styles from './ProjectHeader.module.css';

export interface ProjectHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** the project's name (24px semibold) */
  title: ReactNode;
  status: ProjectStatus;
  /** the status pill: a StatusMenu trigger; defaults to a plain EntityPill */
  statusPill?: ReactNode;
  /** "Jun 1": the start date; with no start the dates show the due date and "+ Start date" */
  start?: ReactNode;
  /** "Jul 1"; leave both dates out for a project without dates */
  due?: ReactNode;
  /** tasks done and in all: the progress pill ("25% · 3 of 12 done"); hidden with no tasks */
  done?: number;
  total?: number;
  /** the "+ Add" property pill */
  onAddProperty?: () => void;
  /** the description: paragraphs of 14px body text, 12px apart */
  description?: ReactNode;
}

/**
 * The top of a project's overview: the name, its properties as pills (status, start → due,
 * progress, "+ Add"), then the description. 12px between the name and the pills, 24px before the
 * description and after it.
 */
export const ProjectHeader = forwardRef<HTMLDivElement, ProjectHeaderProps>(function ProjectHeader(
  {
    title,
    status,
    statusPill,
    start,
    due,
    done = 0,
    total = 0,
    onAddProperty,
    description,
    className,
    ...props
  },
  ref,
) {
  const titleId = useId();
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div ref={ref} aria-labelledby={titleId} className={cn(styles.header, className)} {...props}>
      <div className={styles.titleBlock}>
        <h1 id={titleId} className={styles.title}>
          {title}
        </h1>
        <div className={styles.properties}>
          {statusPill ?? (
            <EntityPill glyph={<ProjectStatusIcon status={status} size={12} />}>
              {PROJECT_STATUS_LABELS[status]}
            </EntityPill>
          )}
          {due != null && <DateRange start={start} due={due} />}
          {total > 0 && (
            <EntityPill glyph={<ProgressRing value={done} total={total} size={12} />}>
              {percent}%<span className={styles.dot}>·</span>
              {done} of {total} done
            </EntityPill>
          )}
          <EntityPill glyph={Plus} onClick={onAddProperty}>
            Add
          </EntityPill>
        </div>
      </div>
      {description != null && <div className={styles.description}>{description}</div>}
    </div>
  );
});
