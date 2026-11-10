import { getRouteApi } from '@tanstack/react-router';

/** The projects list route's search and navigation, for the page's pieces. */
export const projectsRoute = getRouteApi('/app/$workspaceId/projects/');

/** The project page's route. */
export const projectRoute = getRouteApi('/app/$workspaceId/projects/$projectId');
