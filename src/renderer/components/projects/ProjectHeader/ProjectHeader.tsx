import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { DateRange } from '../../detail/DateRange';
import { EntityPill } from '../../entities/EntityPill';
import { ProgressRing } from '../../ui/ProgressRing';
import { ProjectStatus, type Project, type ProjectStats } from '@common/types';
import { PROJECT_STATUS_LABELS, ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { useFormat } from '../../lib/format';
import { dateTone, percentOf } from '../../types';
import styles from './ProjectHeader.module.css';

/** The fields of core's `Project` the header reads. */
export type ProjectHeaderData = Pick<Project, 'title' | 'status' | 'startDate' | 'dueDate'>;

export interface ProjectHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * core's project: its name (30px semibold), status, and dates ("Jun 1 → Jul 1"; with no start
   * the due date and "+ Start date"; no dates pill without a due date)
   */
  project: ProjectHeaderData;
  /** its tasks done, from `projects.stats`: the progress pill ("25% · 3 of 12 done"); hidden with no tasks */
  stats?: Pick<ProjectStats, 'numOfCompleted' | 'totalTasks'>;
  /** the status pill: a StatusMenu trigger; defaults to a plain EntityPill */
  statusPill?: ReactNode;
  /** the "+ Add" property pill */
  onAddProperty?: () => void;
  /** the description, rendered from its markdown: paragraphs of 14px body text, 12px apart */
  description?: ReactNode;
  /**
   * makes the name editable in place: called with the new name when it loses focus or on Enter,
   * if it changed and isn't empty (an empty one goes back). Escape puts it back.
   */
  onTitleChange?: (title: string) => void;
  /**
   * the due date picker (a `DatePicker`): the due pill opens it. With a picker the dates pill shows
   * without a due date too, as "Due date"
   */
  duePicker?: ReactNode;
  /** the start date picker: the start pill, or "+ Start date", opens it */
  startPicker?: ReactNode;
}

/**
 * The top of a project's overview: the name, its properties as pills (status, start → due,
 * progress, "+ Add"), then the description. 12px between the name and the pills, 24px before the
 * description and after it.
 */
export const ProjectHeader = forwardRef<HTMLDivElement, ProjectHeaderProps>(function ProjectHeader(
  {
    project,
    stats,
    statusPill,
    onAddProperty,
    description,
    onTitleChange,
    duePicker,
    startPicker,
    className,
    ...props
  },
  ref,
) {
  const titleId = useId();
  const { now, formatDate } = useFormat();
  const { title, status, startDate, dueDate } = project;
  const done = stats?.numOfCompleted ?? 0;
  const total = stats?.totalTasks ?? 0;
  const percent = percentOf(done, total);
  const dueTone = dateTone(dueDate, now, status === ProjectStatus.COMPLETED);
  return (
    <div ref={ref} aria-labelledby={titleId} className={cn(styles.header, className)} {...props}>
      <div className={styles.titleBlock}>
        <h1
          id={titleId}
          // keyed on the name, so a rename elsewhere shows here
          key={title}
          className={styles.title}
          contentEditable={onTitleChange ? true : undefined}
          suppressContentEditableWarning
          spellCheck={false}
          aria-label={onTitleChange ? 'Name' : undefined}
          onBlur={
            onTitleChange &&
            ((event: FocusEvent<HTMLHeadingElement>) => {
              const next = (event.currentTarget.textContent ?? '').trim();
              if (next === '') event.currentTarget.textContent = title;
              else if (next !== title) onTitleChange(next);
            })
          }
          onKeyDown={
            onTitleChange &&
            ((event: KeyboardEvent<HTMLHeadingElement>) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                event.currentTarget.textContent = title;
                event.currentTarget.blur();
              }
            })
          }
        >
          {title}
        </h1>
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
