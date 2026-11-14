import { useCallback, type MouseEvent, type ReactNode } from 'react';
import { useNavigate, useRouter, type LinkOptions } from '@tanstack/react-router';
import type { BreadcrumbItem } from '@renderer/components';

/**
 * A breadcrumb item that navigates within the app: its `href` is the hash URL (so it can be opened
 * like a link), and a click navigates through the router.
 */
export function useCrumbLink() {
  const router = useRouter();
  const navigate = useNavigate();
  return useCallback(
    (label: ReactNode, to: LinkOptions): BreadcrumbItem => {
      const location = router.buildLocation(to as Parameters<typeof router.buildLocation>[0]);
      return {
        label,
        href: router.history.createHref(location.href),
        onClick: (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          void navigate(to as Parameters<typeof navigate>[0]);
        },
      };
    },
    [router, navigate],
  );
}
