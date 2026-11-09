import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMatches, useNavigate, useRouter, type LinkOptions } from '@tanstack/react-router';
import type { BreadcrumbItem } from '../../components';

// The page's part of the workspace layout's header (docs/renderer/implementation-plan.md, "App
// layout"): by default the header shows the route's `staticData.title`; a page that renders a
// `PageHeaderSlot` replaces it with its own breadcrumb (the section, then the entity's title) and
// adds its actions (a detail page's star and "…" menu) at the right.

interface PageHeaderSlots {
  place: HTMLElement | null;
  actions: HTMLElement | null;
  /** a page's slot is mounted: the layout stops drawing the default breadcrumb */
  claim: () => () => void;
}

const PageHeaderContext = createContext<PageHeaderSlots | null>(null);

/** The workspace layout's side: the slots' elements, and whether a page has claimed them. */
export function usePageHeaderSlots() {
  const [place, setPlace] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((count) => count + 1);
    return () => setClaims((count) => count - 1);
  }, []);
  const value = useMemo(() => ({ place, actions, claim }), [place, actions, claim]);
  return { value, claimed: claims > 0, setPlace, setActions };
}

export const PageHeaderProvider = PageHeaderContext.Provider;

export interface PageHeaderSlotProps {
  /** the page's place: a `Breadcrumb`, usually `[sectionCrumb, the entity's title]` */
  place?: ReactNode;
  /** the page's actions at the header's right: `PageFavoriteButton`, `PageMenuButton` */
  actions?: ReactNode;
}

/**
 * Puts a page's breadcrumb and actions in the workspace layout's `PageHeader`, while mounted. The
 * header moves into the window bar while the sidebar is hidden; the slot follows it.
 */
export function PageHeaderSlot({ place, actions }: PageHeaderSlotProps) {
  const slots = useContext(PageHeaderContext);
  const claim = slots?.claim;
  const claiming = place !== undefined;
  // before paint, so the default breadcrumb never shows under the page's
  useLayoutEffect(() => (claiming && claim ? claim() : undefined), [claim, claiming]);
  if (!slots) return null;
  return (
    <>
      {place !== undefined && slots.place && createPortal(place, slots.place)}
      {actions !== undefined && slots.actions && createPortal(actions, slots.actions)}
    </>
  );
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
