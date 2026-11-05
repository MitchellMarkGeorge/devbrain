import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { CircleCheck, FileText } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EntityPill } from '../../entities/EntityPill';
import { Icon } from '../../ui/Icon';
import type { Swatch } from '../../types';
import styles from './TaskNoteCard.module.css';

export interface TaskNoteCardProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** the note's title, cut with "…" */
  title: string;
  /** when it was edited: "2h ago", "Jul 1" */
  updated: ReactNode;
  /** the note's project, shown as its pill */
  project?: string;
  projectColor?: Swatch | string;
  /** the tasks linked in the note: "2 tasks · 1 in progress", as the note editor shows it */
  tasksSummary?: string;
  /** more pills after the project and summary */
  pills?: ReactNode;
  /** opens the note: clicking anywhere on the card but the pills */
  onOpen?: () => void;
  /**
   * `row` (one line), `stacked` (pills on a second line, for a narrow side sheet) or `auto`,
   * which stacks when the card is narrower than 440px. `auto` by default.
   */
  layout?: 'auto' | 'row' | 'stacked';
}

/**
 * A task's note, under its subtasks: a flat `card` laid out like a task row. The file icon, the
 * title (medium, cut with "…"), then pills for the note's project and its linked tasks, then the
 * edit time. Stacked (in a side sheet), the pills go under the title and the icon and time
 * centre on both lines.
 */
export const TaskNoteCard = forwardRef<HTMLDivElement, TaskNoteCardProps>(function TaskNoteCard(
  {
    title,
    updated,
    project,
    projectColor,
    tasksSummary,
    pills,
    onOpen,
    layout = 'auto',
    className,
    ...props
  },
  ref,
) {
  return (
    <div ref={ref} data-layout={layout} className={cn(styles.card, className)} {...props}>
      <div className={styles.inner}>
        <Icon icon={FileText} size={16} className={styles.icon} />
        <div className={styles.body}>
          <button type="button" className={styles.title} title={title} onClick={onOpen}>
            {title}
          </button>
          {(project != null || tasksSummary != null || pills != null) && (
            <div className={styles.pills}>
              {project != null && (
                <EntityPill type="project" color={projectColor}>
                  {project}
                </EntityPill>
              )}
              {tasksSummary != null && <EntityPill glyph={CircleCheck}>{tasksSummary}</EntityPill>}
              {pills}
            </div>
          )}
        </div>
        <span className={styles.time}>{updated}</span>
      </div>
    </div>
  );
});
