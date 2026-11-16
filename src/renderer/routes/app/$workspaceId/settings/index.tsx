import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  legacySettingsSearchSchema,
  sectionOfLegacyTab,
} from '@renderer/features/settings/api/search';

// /settings opens a section: General, or the one an older link names in ?tab (a saved last page,
// from before each section had its own page).
export const Route = createFileRoute('/app/$workspaceId/settings/')({
  validateSearch: legacySettingsSearchSchema,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: `/app/$workspaceId/settings/${sectionOfLegacyTab(search.tab)}`,
      params,
      replace: true,
    });
  },
});
