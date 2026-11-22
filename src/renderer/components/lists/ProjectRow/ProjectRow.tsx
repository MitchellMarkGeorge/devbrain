import { forwardRef, type CSSProperties } from 'react';
import { Folder } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { ListRow, type ListRowProps } from '../ListRow';
import { Progress } from '../../ui/Progress';
import { PROJECT_STATUS_LABELS, ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { useFormat } from '../../lib/format';
import { cn } from '../../lib/cn';
import { PillHoverCard } from '../../entities/EntityHoverCard';
import { SourcePill } from '../../entities/SourcePill';
import {
  dateTone,
  NO_DATE_LABEL,
  percentOf,
  PROVIDER_LABELS,
  providerOf,
  resolveColor,
} from '../../types';
import { ProjectStatus, type Project, type ProjectStats } from '@common/types';
import styles from './ProjectRow.module.css';

/** The fields of core's `Project` a project row reads; pass the project as it is. */
export type ProjectRowData = Pick<
  Project,
  'title' | 'color' | 'status' | 'dueDate' | 'completedAt' | 'external'
>;

export interface ProjectRowProps extends Omit<
  ListRowProps,
  'icon' | 'title' | 'excerpt' | 'meta' | 'metaWidth' | 'children'
> {
  project: ProjectRowData;
  /** its tasks done, from `projects.stats`: the progress bar; none while it loads */
  stats?: Pick<ProjectStats, 'numOfCompleted' | 'totalTasks'>;
}

/**
 * A project in the Projects list, drawn from core's `Project` and its stats: its folder in the
 * project's colour, the name, a status pill, a 120px progress bar with the percent of tasks done,
 * and its date: always the date ("Jul 1"; "Dec 2025" in another year, from `formatListDate`), the
 * due date coloured when it is today or overdue, or the day it was done once completed ("No date"
 * without one). A project synced from Linear leads its pills with a `SourcePill` ("Linear"). A
 * strokeless 48px `ListRow`.
 */
export const ProjectRow = forwardRef<HTMLDivElement, ProjectRowProps>(function ProjectRow(
  { project, stats, ...props },
  ref,
) {
  const { now, formatListDate } = useFormat();
  // a completed project ends with the day it was done (its status pill says so), else its due date
  const done = project.status === ProjectStatus.COMPLETED;
  const date = done ? (project.completedAt ?? project.dueDate) : project.dueDate;
  const tone = dateTone(project.dueDate, now, done);
  // a project synced from Linear says so, as a synced task's key does
  const { external } = project;
  const provider = external ? providerOf(external) : undefined;
  const color = resolveColor(project.color);
  const progress = stats && percentOf(stats.numOfCompleted, stats.totalTasks);
  return (
    <ListRow
      ref={ref}
      icon={
        <Icon
          icon={Folder}
          size={16}
          className={styles.folder}
          data-coloured={color ? '' : undefined}
          style={color ? ({ '--project-color': color } as CSSProperties) : undefined}
        />
      }
      title={project.title}
      meta={
        date ? (
          <span
            className={cn(tone === 'today' && styles.today, tone === 'overdue' && styles.overdue)}
          >
            {formatListDate(date)}
          </span>
        ) : (
          NO_DATE_LABEL
        )
      }
      {...props}
    >
      {external && (
        <PillHoverCard target={{ type: 'source', title: project.title, external }}>
          <SourcePill provider={provider}>
            {provider ? PROVIDER_LABELS[provider] : 'Synced'}
          </SourcePill>
        </PillHoverCard>
      )}
      <span className={styles.status}>
        <Badge
          variant="outline"
          muted
          icon={<ProjectStatusIcon status={project.status} size={12} />}
        >
          {PROJECT_STATUS_LABELS[project.status]}
        </Badge>
      </span>
      {progress != null && (
        <span className={styles.progress}>
          <Progress
            value={progress}
            aria-label={`${project.title}: ${progress}% done`}
            className={styles.bar}
          />
          <span className={styles.percent}>{progress}%</span>
        </span>
      )}
    </ListRow>
  );
});
