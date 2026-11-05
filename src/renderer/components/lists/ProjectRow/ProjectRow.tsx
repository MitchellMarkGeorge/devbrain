import { forwardRef, type CSSProperties } from 'react';
import { Folder } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { ListRow, type ListRowProps } from '../ListRow';
import { Progress } from '../../ui/Progress';
import {
  PROJECT_STATUS_LABELS,
  ProjectStatusIcon,
  type ProjectStatus,
} from '../../entities/ProjectStatusIcon';
import { resolveColor, type Swatch } from '../../types';
import styles from './ProjectRow.module.css';

/** What a project row shows. */
export interface ProjectRowProject {
  name: string;
  /** the folder's colour: a swatch name or a CSS colour */
  color?: Swatch | string;
  /** shown as a pill with its ProjectStatusIcon */
  status?: ProjectStatus;
  /** tasks done, 0–100 */
  progress?: number;
  /** tasks done and in all, for `compact`'s "3/12" (and its bar, when `progress` is not given) */
  done?: number;
  total?: number;
  /** "Due Jul 1" */
  due?: string;
}

export interface ProjectRowProps extends Omit<
  ListRowProps,
  'icon' | 'title' | 'excerpt' | 'meta' | 'metaWidth' | 'children'
> {
  project: ProjectRowProject;
  /**
   * Home's Recent projects: a 96px bar and "3/12" instead of the status pill and percent, then
   * the due date, or the status when there is none
   */
  compact?: boolean;
}

/**
 * A project in the Projects list: its folder in the project's colour, the name, a status pill, a
 * 120px progress bar with the percent, and the due date. A strokeless 48px `ListRow`. `compact`
 * (Home's Recent projects) draws a 96px bar and "3/12", then the due date or the status.
 */
export const ProjectRow = forwardRef<HTMLDivElement, ProjectRowProps>(function ProjectRow(
  { project, compact, ...props },
  ref,
) {
  const color = resolveColor(project.color);
  const { done, total } = project;
  const counted = done != null && total != null;
  const progress =
    project.progress ?? (done != null && total ? Math.round((done / total) * 100) : undefined);
  const statusLabel = project.status ? PROJECT_STATUS_LABELS[project.status] : undefined;
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
      title={project.name}
      meta={compact ? (project.due ?? statusLabel) : project.due}
      metaWidth={76}
      {...props}
    >
      {compact ? (
        <span className={styles.progress}>
          <Progress
            value={progress ?? 0}
            aria-label={`${project.name}: ${done ?? 0} of ${total ?? 0} tasks done`}
            className={styles.barCompact}
          />
          {counted && (
            <span className={styles.count}>
              {done}/{total}
            </span>
          )}
        </span>
      ) : (
        <>
          <span className={styles.status}>
            {project.status && (
              <Badge
                variant="outline"
                muted
                icon={<ProjectStatusIcon status={project.status} size={12} />}
              >
                {PROJECT_STATUS_LABELS[project.status]}
              </Badge>
            )}
          </span>
          {project.progress != null && (
            <span className={styles.progress}>
              <Progress
                value={project.progress}
                aria-label={`${project.name}: ${project.progress}% done`}
                className={styles.bar}
              />
              <span className={styles.percent}>{project.progress}%</span>
            </span>
          )}
        </>
      )}
    </ListRow>
  );
});
