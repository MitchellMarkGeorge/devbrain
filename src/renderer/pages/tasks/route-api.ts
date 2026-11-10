import { getRouteApi } from '@tanstack/react-router';

/** The tasks list route's search and navigation, for the page's pieces. */
export const tasksRoute = getRouteApi('/app/$workspaceId/tasks/');

/** The task page's route. */
export const taskRoute = getRouteApi('/app/$workspaceId/tasks/$taskId');
