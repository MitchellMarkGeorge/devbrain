import { forwardRef, type CSSProperties } from 'react';
import { Folder } from 'lucide-react';
import { Badge } from '../Badge';
import { Icon } from '../Icon';
import { ListRow, type ListRowProps } from '../ListRow';
import { Progress } from '../Progress';
import { PROJECT_STATUS_LABELS, ProjectStatusIcon, type ProjectStatus } from '../ProjectStatusIcon';
import { resolveColor, type Swatch } from '../types';
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
  /** "Due Jul 1" */
  due?: string;
}

export interface ProjectRowProps extends Omit<
  ListRowProps,
  'icon' | 'title' | 'excerpt' | 'meta' | 'metaWidth' | 'children'
> {
  project: ProjectRowProject;
}

/**
 * A project in the Projects list: its folder in the project's colour, the name, a status pill, a
 * 120px progress bar with the percent, and the due date. A strokeless 48px `ListRow`.
 */
export const ProjectRow = forwardRef<HTMLDivElement, ProjectRowProps>(function ProjectRow(
  { project, ...props },
  ref,
) {
  const color = resolveColor(project.color);
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
      meta={project.due}
      metaWidth={76}
      {...props}
    >
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
    </ListRow>
  );
});
