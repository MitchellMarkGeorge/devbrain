import { CircleDot, Star, Trash2 } from 'lucide-react';
import { ProjectStatus, type ProjectListItem } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  ProjectStatusIcon,
  SelectionBar,
  ValueMenuContent,
  type ValueMenuOption,
} from '@renderer/components';
import type { ProjectActions } from '../../hooks/use-project-actions';
import styles from './ProjectsView.module.css';

export interface ProjectsSelectionBarProps {
  /** the selected projects, loaded */
  projects: ProjectListItem[];
  actions: ProjectActions;
  onClear: () => void;
}

const ABOVE = { side: 'top', align: 'start', sideOffset: 8 } as const;

const STATUS_OPTIONS: ValueMenuOption<ProjectStatus>[] = PROJECT_STATUSES.map((status, i) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
  icon: <ProjectStatusIcon status={status} />,
  key: String(i + 1),
  shortcut: String(i + 1),
}));

/**
 * The selection bar over the projects list, as the tasks and notes lists' (Figma `7424:38163`):
 * the count, then Status and Favorite for every selected project, Move to trash under "more", and
 * clear.
 */
export function ProjectsSelectionBar({ projects, actions, onClear }: ProjectsSelectionBarProps) {
  const allFavorites = projects.every((project) => project.favoritedAt);
  // the status every selected project shares, ticked in the menu
  const shared = projects.every((project) => project.status === projects[0]?.status)
    ? projects[0]?.status
    : undefined;
  return (
    <div className={styles.bar}>
      <SelectionBar
        open={projects.length > 0}
        count={projects.length}
        floating={false}
        aria-label="Selected projects"
        onClear={onClear}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="sm" icon={CircleDot} />}>
                Status
              </DropdownMenuTrigger>
              <ValueMenuContent
                {...ABOVE}
                label="Status"
                options={STATUS_OPTIONS}
                value={shared}
                onPick={(status) => actions.setStatusOf(projects, status)}
              />
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              icon={Star}
              onClick={() => actions.toggleFavorite(projects)}
            >
              {allFavorites ? 'Unfavorite' : 'Favorite'}
            </Button>
          </>
        }
        more={
          <DropdownMenuItem
            icon={Trash2}
            shortcut="⌘⌫"
            variant="destructive"
            onClick={() => {
              void actions.trashAll(projects).then((moved) => {
                if (moved) onClear();
              });
            }}
          >
            Move to trash
          </DropdownMenuItem>
        }
      />
    </div>
  );
}
