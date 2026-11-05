import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { ArrowLeft, ArrowRight, PanelLeft } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAppShell, type TrafficLightsMode } from '../AppShell/context';
import { IconButton } from '../../ui/IconButton';
import styles from './WindowBar.module.css';

export interface TrafficLightsProps extends ComponentPropsWithoutRef<'span'> {
  /** `reserved` (the default) keeps the space for the system's own; `drawn` paints stand-ins */
  mode?: TrafficLightsMode;
}

/**
 * The macOS close, minimise and zoom buttons' 52×12 slot. The system draws the real ones
 * (Electron's `hiddenInset` title bar), so the app only keeps their space; `drawn` paints
 * stand-ins for stories and mock-ups.
 */
export function TrafficLights({ mode, className, ...props }: TrafficLightsProps) {
  const shell = useAppShell();
  const shown = mode ?? shell.trafficLights;
  if (shown === 'none') return null;
  return (
    <span
      aria-hidden
      data-drawn={shown === 'drawn' ? '' : undefined}
      className={cn(styles.lights, className)}
      {...props}
    >
      {shown === 'drawn' && (
        <>
          <span className={styles.close} />
          <span className={styles.minimise} />
          <span className={styles.zoom} />
        </>
      )}
    </span>
  );
}

export interface WindowControlsProps extends ComponentPropsWithoutRef<'div'> {
  onToggleSidebar?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

/**
 * The sidebar toggle (⌘\), then back and forward: three 28px muted icon buttons, 8px apart. They
 * act on the `AppShell` around them unless given handlers.
 */
export const WindowControls = forwardRef<HTMLDivElement, WindowControlsProps>(
  function WindowControls(
    { onToggleSidebar, onBack, onForward, canGoBack, canGoForward, className, ...props },
    ref,
  ) {
    const shell = useAppShell();
    const toggleLabel = shell.rail
      ? shell.size === 'compact'
        ? 'Open sidebar'
        : 'Expand sidebar'
      : 'Collapse sidebar';
    return (
      <div ref={ref} className={cn(styles.controls, className)} {...props}>
        <IconButton
          size="sm"
          tone="muted"
          icon={PanelLeft}
          label={shell.inDrawer ? 'Close sidebar' : toggleLabel}
          tooltip={
            <>
              {shell.inDrawer ? 'Close sidebar' : toggleLabel}{' '}
              <span className={styles.key}>⌘\</span>
            </>
          }
          onClick={onToggleSidebar ?? (shell.inDrawer ? shell.closeDrawer : shell.toggleSidebar)}
        />
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

export type WindowBarProps = ComponentPropsWithoutRef<'div'>;

/**
 * The 48px bar across the window while the sidebar is the rail: traffic lights, the window
 * controls, then the page's header (its breadcrumb, and its actions at the right). The bar drags
 * the window; its buttons don't.
 */
export const WindowBar = forwardRef<HTMLDivElement, WindowBarProps>(function WindowBar(
  { className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.bar, className)} {...props}>
      <TrafficLights />
      <WindowControls />
      <div className={styles.page}>{children}</div>
    </div>
  );
});
