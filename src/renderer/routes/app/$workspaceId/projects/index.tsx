import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '@renderer/features/projects/page/ProjectsPage';
import { loadProjects } from '@renderer/features/projects/api/loaders';
import { projectsSearchSchema } from '@renderer/features/projects/api/search';

// The projects: rows or cards, with the status filter and sort in the URL (?view=card&status=all).
export const Route = createFileRoute('/app/$workspaceId/projects/')({
  staticData: { title: 'Projects' },
  validateSearch: projectsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadProjects(context, deps),
  component: ProjectsPage,
});
