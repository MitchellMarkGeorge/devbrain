import { useQuery } from '@tanstack/react-query';
import type { ProjectId } from '@common/ids';
import { ProjectStatus } from '@common/types';
import { resolveColor, type PickerProject } from '../../../components';
import { trpc } from '../../../ipc';
import { usePickerSearch } from '../../search/picker-search';
import { SearchHighlight } from '../../search/SearchHighlight';
import { useProjectOptions } from './use-project-options';

const PROJECT_TYPES = ['project'] as const;

/**
 * The projects a project picker lists, inside a `PickerSearchFilter`: the loaded ones while
 * nothing is typed, else the projects search finds, completed ones left out as the loaded list
 * leaves them out. `searching` is true once something is typed: "No project" is hidden then.
 */
export function useProjectPickerRows(): { projects: PickerProject[]; searching: boolean } {
  const loaded = useProjectOptions();
  const search = usePickerSearch(PROJECT_TYPES);
  if (search.results) {
    return {
      searching: true,
      projects: search.results
        .filter((row) => !row.closed)
        .map((row) => ({
          id: row.id,
          name: row.title || 'Untitled',
          label: row.title ? <SearchHighlight html={row.titleHtml} /> : undefined,
          color: resolveColor(row.color, 'blue') ?? 'blue',
        })),
    };
  }
  return {
    searching: search.query !== '',
    projects: loaded.filter((project) => search.matches(project.name)),
  };
}

/**
 * The picked project as `projects` lists it, or read on its own when it isn't there: one search
 * found beyond the loaded list. Undefined for none, and while it loads.
 */
export function usePickedProject(
  projectId: string | null | undefined,
  projects: readonly PickerProject[],
): PickerProject | undefined {
  const listed = projects.find((project) => project.id === projectId);
  const project = useQuery({
    ...trpc.projects.get.queryOptions({ id: (projectId ?? '') as ProjectId }),
    enabled: !!projectId && !listed,
  });
  if (listed || !projectId || !project.data || project.data.status === ProjectStatus.COMPLETED) {
    return listed;
  }
  return {
    id: project.data.id,
    name: project.data.title,
    color: resolveColor(project.data.color, 'blue') ?? 'blue',
  };
}
