import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMatches, useNavigate, useRouter, type LinkOptions } from '@tanstack/react-router';
import { VisuallyHidden, type BreadcrumbItem } from '../../components';

// The page's part of the workspace layout's header (docs/renderer/implementation-plan.md, "App
// layout"): by default the header shows the route's `staticData.title`; a page that renders a
// `PageHeaderSlot` puts its own breadcrumb (the section, then the entity's title) in its place, and
// its actions (a detail page's star and "…" menu) at the right. The header's own elements are the
// targets, so what is portalled into them is laid out as the header's own children.

interface PageHeaderSlots {
  place: HTMLElement | null;
  actions: HTMLElement | null;
}

const PageHeaderContext = createContext<PageHeaderSlots | null>(null);

/** The workspace layout's side: the header's elements, for `PageHeader`'s `placeRef` and `actionsRef`. */
export function usePageHeaderSlots() {
  const [place, setPlace] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ place, actions }), [place, actions]);
  return { value, setPlace, setActions };
}

export const PageHeaderProvider = PageHeaderContext.Provider;

export interface PageHeaderSlotProps {
  /** the page's place: a `Breadcrumb`, usually `[sectionCrumb, the entity's title]` */
  place?: ReactNode;
  /** the page's actions at the header's right: `PageFavoriteButton`, `PageMenuButton` */
  actions?: ReactNode;
}

/**
 * Puts a page's breadcrumb and actions in the workspace layout's `PageHeader`, while mounted; the
 * header's fallback (the route's title) steps aside while its place is filled. The shell never
 * moves the header, so its elements, and what is portalled into them, stay put.
 */
export function PageHeaderSlot({ place, actions }: PageHeaderSlotProps) {
  const slots = useContext(PageHeaderContext);
  if (!slots) return null;
  return (
    <>
      {place !== undefined && slots.place && createPortal(place, slots.place)}
      {actions !== undefined && slots.actions && createPortal(actions, slots.actions)}
    </>
  );
}

/**
 * A list page's `h1`, for screen readers: the page's name ("Tasks"), which its breadcrumb shows
 * and a list page draws no title of its own for. Detail pages, Home, Settings and Integrations
 * draw theirs.
 */
export function PageTitle({ children }: { children: ReactNode }) {
  return <VisuallyHidden render={<h1 />}>{children}</VisuallyHidden>;
}

/** The title of the nearest route that has one (`staticData.title`): "Tasks". */
export function useRouteTitle(): string | undefined {
  return useMatches({
    select: (matches) =>
      [...matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  });
}

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
