import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { cn } from '../../lib/cn';
import { PageHeaderInWindowBar } from '../PageHeader/PageHeader';
import { TooltipProvider } from '../Tooltip';
import { WindowBar } from '../WindowBar';
import {
  AppShellContext,
  type AppShellContextValue,
  type TrafficLightsMode,
  type WindowSize,
} from './context';
import styles from './AppShell.module.css';

/** `breakpoint-medium` and `breakpoint-wide` (tokens.css); media queries can't read variables. */
const MEDIUM = 1080;
const WIDE = 1280;

export function windowSizeFor(width: number): WindowSize {
  if (width < MEDIUM) return 'compact';
  if (width < WIDE) return 'medium';
  return 'wide';
}

export interface AppShellProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the app's `Sidebar`; the shell draws it as the full sidebar, the rail or the drawer */
  sidebar: ReactNode;
  /** the page's `PageHeader`; moves into the `WindowBar` while the sidebar is the rail */
  header?: ReactNode;
  /** the page under its header: a `PageToolbar` and a `PageContent` */
  children?: ReactNode;
  /** Home's right column (mini calendar and agenda), 288px; hidden below `breakpoint-wide` */
  aside?: ReactNode;
  /**
   * A docked sheet is open: the shell opens a `sheet-width` column at the right for it. Portal the
   * `SheetContent` into `useAppShell().sheetContainer`. In compact windows sheets float instead.
   */
  sheetOpen?: boolean;
  /** the user's choice: rest as the rail at any size (⌘\) */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** the compact window's drawer */
  drawerOpen?: boolean;
  defaultDrawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  /** pin the window size instead of measuring the shell (stories, tests) */
  size?: WindowSize;
  trafficLights?: TrafficLightsMode;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (value: T) => void] {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const set = useCallback(
    (next: T) => {
      setOwn(next);
      onChange?.(next);
    },
    [onChange],
  );
  return [current, set];
}

/**
 * The frame every screen shares: the sidebar at the left, the page (header, toolbar, content) and
 * Home's right column or a docked sheet at the right. It measures its own width and follows the
 * README's window sizes: below 1280px the right column hides; below 1080px the sidebar rests as
 * the 56px rail, its toggle opens the full sidebar as a drawer over the page, and sheets float.
 * While the sidebar is the rail the window bar runs across the top with the page's header in it.
 */
export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell(
  {
    sidebar,
    header,
    children,
    aside,
    sheetOpen = false,
    collapsed: collapsedProp,
    defaultCollapsed = false,
    onCollapsedChange,
    drawerOpen: drawerOpenProp,
    defaultDrawerOpen = false,
    onDrawerOpenChange,
    size: sizeProp,
    trafficLights = 'reserved',
    onBack,
    onForward,
    canGoBack = true,
    canGoForward = false,
    className,
    ...props
  },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => root.current as HTMLDivElement);
  const sheetContainer = useRef<HTMLDivElement>(null);
  const drawerPopup = useRef<HTMLDivElement>(null);

  const [measured, setMeasured] = useState<WindowSize>(() =>
    typeof window === 'undefined' ? 'wide' : windowSizeFor(window.innerWidth),
  );
  useLayoutEffect(() => {
    if (sizeProp || !root.current) return;
    const el = root.current;
    setMeasured(windowSizeFor(el.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => {
      setMeasured(windowSizeFor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sizeProp]);
  const size = sizeProp ?? measured;
  const compact = size === 'compact';

  const [collapsed, setCollapsed] = useControllable(
    collapsedProp,
    defaultCollapsed,
    onCollapsedChange,
  );
  const [drawerOpen, setDrawerOpen] = useControllable(
    drawerOpenProp,
    defaultDrawerOpen,
    onDrawerOpenChange,
  );
  const rail = collapsed || compact;
  const drawerShown = compact && !collapsed && drawerOpen;

  // leaving the compact range closes the drawer
  const wasCompact = useRef(compact);
  useEffect(() => {
    if (wasCompact.current && !compact && drawerOpen) setDrawerOpen(false);
    wasCompact.current = compact;
  }, [compact, drawerOpen, setDrawerOpen]);

  const toggleSidebar = useCallback(() => {
    if (compact && !collapsed) setDrawerOpen(!drawerOpen);
    else setCollapsed(!collapsed);
  }, [compact, collapsed, drawerOpen, setCollapsed, setDrawerOpen]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), [setDrawerOpen]);

  // Dialogs portal to <body>, outside the shell, and centre over the page beside the sidebar: give
  // them the sidebar's width on the root (Dialog reads --dialog-inset-left)
  const hasSidebar = sidebar != null;
  useEffect(() => {
    const root = document.documentElement;
    const inset = !hasSidebar ? '0px' : rail ? 'var(--sidebar-rail-width)' : 'var(--sidebar-width)';
    root.style.setProperty('--dialog-inset-left', inset);
    return () => {
      root.style.removeProperty('--dialog-inset-left');
    };
  }, [hasSidebar, rail]);

  // ⌘\ toggles the sidebar
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '\\' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  const base = useMemo<AppShellContextValue>(
    () => ({
      inShell: true,
      size,
      rail,
      inDrawer: false,
      drawerOpen: drawerShown,
      toggleSidebar,
      closeDrawer,
      trafficLights,
      onBack,
      onForward,
      canGoBack,
      canGoForward,
      sheetContainer,
    }),
    [
      size,
      rail,
      drawerShown,
      toggleSidebar,
      closeDrawer,
      trafficLights,
      onBack,
      onForward,
      canGoBack,
      canGoForward,
    ],
  );
  const drawer = useMemo<AppShellContextValue>(
    () => ({ ...base, rail: false, inDrawer: true }),
    [base],
  );

  return (
    <AppShellContext.Provider value={base}>
      <TooltipProvider>
        <div
          ref={root}
          data-size={size}
          data-rail={rail ? '' : undefined}
          className={cn(styles.shell, className)}
          {...props}
        >
          {rail && (
            <PageHeaderInWindowBar.Provider value>
              <WindowBar className={styles.windowBar}>{header}</WindowBar>
            </PageHeaderInWindowBar.Provider>
          )}
          <div className={styles.sidebar}>{sidebar}</div>
          <main className={styles.main}>
            {!rail && header}
            <div className={styles.scroll}>{children}</div>
          </main>
          {aside && <aside className={styles.aside}>{aside}</aside>}
          <div
            ref={sheetContainer}
            className={styles.sheet}
            data-open={sheetOpen && !compact ? '' : undefined}
          />
        </div>
        {compact && !collapsed && (
          <Dialog.Root open={drawerShown} onOpenChange={setDrawerOpen}>
            <Dialog.Portal container={root}>
              <Dialog.Backdrop className={styles.backdrop} />
              <Dialog.Popup
                ref={drawerPopup}
                initialFocus={drawerPopup}
                className={styles.drawer}
                aria-label="Sidebar"
              >
                <AppShellContext.Provider value={drawer}>{sidebar}</AppShellContext.Provider>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </TooltipProvider>
    </AppShellContext.Provider>
  );
});
