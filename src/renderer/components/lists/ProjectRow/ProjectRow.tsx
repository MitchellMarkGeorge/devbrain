import { forwardRef, type CSSProperties } from 'react';
import { Folder } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { ListRow, type ListRowProps } from '../ListRow';
import { Progress } from '../../ui/Progress';
import type { Project, ProjectStats } from '@common/types';
import { PROJECT_STATUS_LABELS, ProjectStatusIcon } from '../../entities/ProjectStatusIcon';
import { useFormat } from '../../lib/format';
import { percentOf, resolveColor } from '../../types';
import { projectDateText } from '../../project-text';
import styles from './ProjectRow.module.css';

/** The fields of core's `Project` a project row reads; pass the project as it is. */
export type ProjectRowData = Pick<
  Project,
  'title' | 'color' | 'status' | 'dueDate' | 'completedAt'
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
 * and the due date ("Due Jul 1", or "Done Jun 12" once completed). A strokeless 48px `ListRow`.
 */
export const ProjectRow = forwardRef<HTMLDivElement, ProjectRowProps>(function ProjectRow(
  { project, stats, ...props },
  ref,
) {
  const format = useFormat();
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
      meta={projectDateText(project, format)}
      metaWidth={76}
      {...props}
    >
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
