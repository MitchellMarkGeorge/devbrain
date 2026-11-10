import { getRouteApi } from '@tanstack/react-router';

/** The notes list route's search and navigation, for the page's pieces. */
export const notesRoute = getRouteApi('/app/$workspaceId/notes/');

/** The note page's route. */
export const noteRoute = getRouteApi('/app/$workspaceId/notes/$noteId');
