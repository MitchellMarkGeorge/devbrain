import { createFileRoute } from '@tanstack/react-router';
import { ProjectPage } from '../../../../pages/projects/detail/ProjectPage';
import {
  loadProject,
  parseProjectParams,
  projectLoaderDeps,
} from '../../../../pages/projects/loaders';
import { projectSearchSchema } from '../../../../pages/projects/search';

// A project's page, with its tab in the URL (?tab=tasks); a missing or deleted project is its
// not-found.
export const Route = createFileRoute('/app/$workspaceId/projects/$projectId')({
  staticData: { title: 'Projects' },
  params: parseProjectParams,
  validateSearch: projectSearchSchema,
  loaderDeps: projectLoaderDeps,
  loader: ({ context, params, deps }) => loadProject(context, params.projectId, deps),
  component: ProjectPage,
});
