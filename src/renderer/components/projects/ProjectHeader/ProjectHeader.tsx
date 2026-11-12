import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { DateRange } from '../../detail/DateRange';
import { EditorTitle } from '../../editor/EditorContent';
import { EntityPill } from '../../entities/EntityPill';
import { ProjectStatus, type Project } from '@common/types';
import { PROJECT_STATUS_LABELS, ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { useFormat } from '../../lib/format';
import { dateTone } from '../../types';
import styles from './ProjectHeader.module.css';

/** The fields of core's `Project` the header reads. */
export type ProjectHeaderData = Pick<Project, 'title' | 'status' | 'startDate' | 'dueDate'>;

export interface ProjectHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * core's project: its name, status, and dates ("Jun 1 → Jul 1"; with no start the due date and
   * "+ Start date"; no dates pill without a due date)
   */
  project: ProjectHeaderData;
  /** above the name: the project page's tile, its folder in its colour, which opens Change colour */
  icon?: ReactNode;
  /**
   * the name: an `EditorTitle` at `size="lg"` the page makes editable; defaults to that title
   * showing `project.title`
   */
  title?: ReactNode;
  /** the status pill: a StatusMenu trigger; defaults to a plain EntityPill */
  statusPill?: ReactNode;
  /**
   * the due date picker (a `DatePicker`): the due pill opens it. With a picker the dates pill shows
   * without a due date too, as "Due date"
   */
  duePicker?: ReactNode;
  /** the start date picker: the start pill, or "+ Start date", opens it */
  startPicker?: ReactNode;
  /** quiet text after the pills: how long is left ("6 days left", "2 days overdue") */
  meta?: ReactNode;
  /** the description: the page's `RichTextEditor`, or paragraphs of 14px body text */
  description?: ReactNode;
}

/**
 * The top of a project's overview, as a document's: the project's tile, the name (30px), its
 * properties as pills (status, start → due) with how long is left, then the description.
 */
export const ProjectHeader = forwardRef<HTMLDivElement, ProjectHeaderProps>(function ProjectHeader(
  {
    project,
    icon,
    title,
    statusPill,
    duePicker,
    startPicker,
    meta,
    description,
    className,
    ...props
  },
  ref,
) {
  const titleId = useId();
  const { now, formatDate } = useFormat();
  const { status, startDate, dueDate } = project;
  const dueTone = dateTone(dueDate, now, status === ProjectStatus.COMPLETED);
  return (
    <div ref={ref} aria-labelledby={titleId} className={cn(styles.header, className)} {...props}>
      {icon != null && <div className={styles.icon}>{icon}</div>}
      <div id={titleId} className={styles.title}>
        {title ?? <EditorTitle size="lg">{project.title}</EditorTitle>}
      </div>
      <div className={styles.properties}>
        {statusPill ?? (
          <EntityPill glyph={<ProjectStatusIcon status={status} size={12} />}>
            {PROJECT_STATUS_LABELS[status]}
          </EntityPill>
        )}
        {(dueDate || duePicker != null) && (
          <DateRange
            start={startDate ? formatDate(startDate) : undefined}
            due={dueDate ? formatDate(dueDate) : 'Due date'}
            dueTone={dueTone}
            duePicker={duePicker}
            startPicker={startPicker}
          />
        )}
        {meta != null && <span className={styles.meta}>{meta}</span>}
      </div>
      {description != null && <div className={styles.description}>{description}</div>}
    </div>
  );
});
