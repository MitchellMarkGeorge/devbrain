import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Menu, Minus, PanelLeft, Square, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFormatKeys, useWindowFrame } from '../../lib/platform';
import { useWorkspaceShell, type WorkspaceShellContextValue } from '../WorkspaceShell/context';
import { IconButton, type IconButtonProps } from '../../ui/IconButton';
import styles from './WindowBar.module.css';

export interface TrafficLightsProps extends ComponentPropsWithoutRef<'span'> {
  /**
   * Paint stand-ins rather than keep the space for the system's own: the window frame's
   * `controls` by default (`drawn` in stories)
   */
  drawn?: boolean;
}

/**
 * The macOS close, minimise and zoom buttons' 68×12 slot: the three 12px buttons, 8px apart (52px),
 * and 16px clear of what follows. The system draws the real ones
 * (src/main/runtime/window-chrome.ts), so the app only keeps their space; stories paint stand-ins.
 */
export function TrafficLights({ drawn, className, ...props }: TrafficLightsProps) {
  const frame = useWindowFrame();
  const shown = drawn ?? frame.controls === 'drawn';
  return (
    <span
      aria-hidden
      data-drawn={shown ? '' : undefined}
      className={cn(styles.lights, className)}
      {...props}
    >
      {shown && (
        <>
          <span className={styles.close} />
          <span className={styles.minimise} />
          <span className={styles.zoom} />
        </>
      )}
    </span>
  );
}

export type AppMenuButtonProps = Omit<IconButtonProps, 'icon' | 'label'>;

/**
 * Windows' menu button, where macOS has the traffic lights: Windows shows no menu bar, as the page
 * draws the title bar, so this pops up the app menu (the window frame's `onOpenAppMenu`) under it.
 */
export const AppMenuButton = forwardRef<HTMLButtonElement, AppMenuButtonProps>(
  function AppMenuButton({ onClick, ...props }, ref) {
    const { onOpenAppMenu } = useWindowFrame();
    return (
      <IconButton
        ref={ref}
        size="sm"
        tone="muted"
        icon={Menu}
        label="Menu"
        onClick={(event) => {
          onClick?.(event);
          const box = event.currentTarget.getBoundingClientRect();
          onOpenAppMenu?.({ x: box.left, y: box.bottom });
        }}
        {...props}
      />
    );
  },
);

/**
 * The start of the title bar, before the window controls: the traffic lights' slot on macOS, the
 * menu button on Windows, and nothing on Linux, whose system frame has its own title bar and menu
 * bar above the page. Each slot ends 16px clear of what follows, so a row needs no gap after it.
 */
export function WindowStart({ className }: { className?: string }) {
  const { platform } = useWindowFrame();
  if (platform === 'macos') return <TrafficLights className={className} />;
  if (platform === 'windows') {
    return (
      <span className={cn(styles.menuSlot, className)}>
        <AppMenuButton />
      </span>
    );
  }
  return null;
}

/**
 * Stand-ins for the minimise, maximise and close buttons Windows draws over the page's top right:
 * 3 × 46px by 48px. Stories and mock-ups only; in the app Windows draws them and the page keeps
 * their corner clear (`--caption-buttons-width`). `WorkspaceShell` and `AppShell` place them.
 */
export function CaptionButtons({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span aria-hidden className={cn(styles.captionButtons, className)} {...props}>
      <span>
        <Minus size={14} strokeWidth={1.25} />
      </span>
      <span>
        <Square size={11} strokeWidth={1.25} />
      </span>
      <span>
        <X size={14} strokeWidth={1.25} />
      </span>
    </span>
  );
}

export interface WindowControlsProps extends ComponentPropsWithoutRef<'div'> {
  onToggleSidebar?: () => void;
}

/** What the sidebar toggle does, as its label and tooltip say. */
function toggleLabel(shell: WorkspaceShellContextValue): string {
  if (!shell.sidebarHidden) return 'Hide sidebar';
  if (!shell.drawerOpen) return 'Show sidebar';
  // the drawer is open under the title bar: the toggle docks it, or pins or closes it
  if (shell.size !== 'compact') return 'Dock sidebar';
  return shell.peeking ? 'Keep sidebar open' : 'Close sidebar';
}

/**
 * The sidebar toggle (⌘\, Ctrl+\ off macOS), a 28px muted icon button. It acts on the
 * `WorkspaceShell` around it unless given a handler. While the sidebar is hidden, pointing at it
 * peeks at the drawer; clicking it pins the drawer open, or docks the sidebar where the window is
 * wide enough.
 */
export const WindowControls = forwardRef<HTMLDivElement, WindowControlsProps>(
  function WindowControls({ onToggleSidebar, className, ...props }, ref) {
    const shell = useWorkspaceShell();
    const formatKeys = useFormatKeys();
    const label = toggleLabel(shell);
    const peeks = !onToggleSidebar && shell.sidebarHidden && !shell.inDrawer;
    return (
      <div ref={ref} className={cn(styles.controls, className)} {...props}>
        <IconButton
          size="sm"
          tone="muted"
          icon={PanelLeft}
          label={label}
          data-sidebar-toggle=""
          tooltip={
            <>
              {label} <span className={styles.key}>{formatKeys('⌘\\')}</span>
            </>
          }
          onClick={onToggleSidebar ?? shell.toggleSidebar}
          onPointerEnter={
            peeks
              ? (event) => {
                  if (event.pointerType === 'mouse') shell.peekSidebar();
                }
              : undefined
          }
          onPointerLeave={peeks ? shell.cancelPeek : undefined}
        />
      </div>
    );
  },
);

export interface HistoryControlsProps extends ComponentPropsWithoutRef<'div'> {
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

/**
 * Back and forward: two 28px muted icon buttons, 4px apart, on the `WorkspaceShell`'s history
 * unless given handlers. The shell puts them before its search field, in the title bar's middle.
 */
export const HistoryControls = forwardRef<HTMLDivElement, HistoryControlsProps>(
  function HistoryControls(
    { onBack, onForward, canGoBack, canGoForward, className, ...props },
    ref,
  ) {
    const shell = useWorkspaceShell();
    return (
      <div ref={ref} className={cn(styles.history, className)} {...props}>
        <IconButton
          size="sm"
          tone="muted"
          icon={ArrowLeft}
          label="Back"
          disabled={!(canGoBack ?? shell.canGoBack)}
          onClick={onBack ?? shell.onBack}
        />
        <IconButton
          size="sm"
          tone="muted"
          icon={ArrowRight}
          label="Forward"
          disabled={!(canGoForward ?? shell.canGoForward)}
          onClick={onForward ?? shell.onForward}
        />
      </div>
    );
  },
);

export interface WindowBarProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the open workspace, opening the workspace menu (a `WorkspaceButton`), between the start and the toggle */
  workspace?: ReactNode;
}

/**
 * The start of the title bar, as wide as the sidebar: the window's start (traffic lights on macOS,
 * the menu button on Windows), the workspace switcher, and the sidebar toggle right after it. The
 * switcher shrinks to its name and cuts a long one short, so the three never pass the sidebar's
 * width. None of it moves as the sidebar hides and docks. The strip drags the window; its buttons
 * don't.
 */
export const WindowBar = forwardRef<HTMLDivElement, WindowBarProps>(function WindowBar(
  { workspace, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.bar, className)} {...props}>
      <WindowStart />
      <div className={styles.workspace}>{workspace}</div>
      <WindowControls />
    </div>
  );
});
