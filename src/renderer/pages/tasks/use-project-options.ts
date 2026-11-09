import { useQuery } from '@tanstack/react-query';
import { ProjectStatus } from '@common/types';
import { resolveColor, type PickerProject } from '../../components';
import { trpc } from '../../ipc';

/** The projects a picker offers: the workspace's (up to 200), each with its folder colour. */
export function useProjectOptions(): PickerProject[] {
  const projects = useQuery(trpc.projects.list.queryOptions({ limit: 200 }));
  return (projects.data?.items ?? [])
    .filter((project) => project.status !== ProjectStatus.COMPLETED)
    .map((project) => ({
      id: project.id,
      name: project.title,
      color: resolveColor(project.color, 'blue') ?? 'blue',
    }));
}
