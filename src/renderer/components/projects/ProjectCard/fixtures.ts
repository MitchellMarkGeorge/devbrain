import { ProjectStatus, type Project, type ProjectStats } from '@common/types';
import { storyDate } from '../../lib/story-dates';

/** The fields of core's `Project` the project card, row and header read. */
export type SampleProject = Pick<
  Project,
  'title' | 'color' | 'status' | 'startDate' | 'dueDate' | 'completedAt'
>;

/** A core-shaped project for stories, with its stats. Colours are swatch names (or `#rrggbb`). */
export interface SampleProjectWithStats {
  project: SampleProject;
  stats: Pick<ProjectStats, 'numOfCompleted' | 'totalTasks'>;
}

function sample(
  title: string,
  color: string,
  status: ProjectStatus,
  dueIn: number,
  done: number,
  total: number,
  extra: Partial<SampleProject> = {},
): SampleProjectWithStats {
  return {
    project: {
      title,
      color,
      status,
      startDate: null,
      dueDate: storyDate(dueIn),
      completedAt: null,
      ...extra,
    },
    stats: { numOfCompleted: done, totalTasks: total },
  };
}

export const AUTH_OVERHAUL = sample('Auth Overhaul', 'blue', ProjectStatus.ACTIVE, 9, 3, 12, {
  startDate: storyDate(-21),
});

export const SAMPLE_PROJECTS: SampleProjectWithStats[] = [
  sample('AI Action Items', 'green', ProjectStatus.ACTIVE, 4, 3, 6),
  sample('API Gateway v2', 'amber', ProjectStatus.ACTIVE, 8, 4, 10),
  AUTH_OVERHAUL,
  sample('ML Platform', 'pink', ProjectStatus.ON_HOLD, 18, 6, 10),
  sample('User Interface Revamp', 'indigo', ProjectStatus.NOT_STARTED, 23, 0, 8),
  sample('Calendar sync', 'green', ProjectStatus.COMPLETED, -14, 9, 9, {
    completedAt: storyDate(-10),
  }),
];
