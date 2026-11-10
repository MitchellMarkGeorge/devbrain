import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '../../../../pages/projects/views/ProjectsPage';
import { loadProjects } from '../../../../pages/projects/loaders';
import { projectsSearchSchema } from '../../../../pages/projects/search';

// The projects: rows or cards, with the status filter and sort in the URL (?view=card&status=all).
export const Route = createFileRoute('/app/$workspaceId/projects/')({
  staticData: { title: 'Projects' },
  validateSearch: projectsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadProjects(context, deps),
  component: ProjectsPage,
});
