import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useWindowFrame } from '../../lib/platform';
import { CaptionButtons, WindowStart } from '../../shell/WindowBar';
import styles from './OnboardingScreen.module.css';

export interface OnboardingScreenProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** the mark above the title: a `Logomark` (40×48), or a workspace's tile */
  logo?: ReactNode;
  /** "Welcome to DevBrain" (30px semibold) */
  title?: ReactNode;
  /** one line under the title */
  description?: ReactNode;
  /** pinned to the window's foot: "What's a workspace?" */
  footer?: ReactNode;
}

/**
 * The window before a workspace is open (splash, Welcome, Create workspace): no sidebar, the title
 * bar's start alone in a draggable top strip (the traffic lights on macOS, the menu button on
 * Windows, whose caption buttons sit at its right), and one centred column: the mark, the title, a
 * line, then the content (a `WorkspaceList`, buttons, a card), with an optional footer link.
 */
export const OnboardingScreen = forwardRef<HTMLDivElement, OnboardingScreenProps>(
  function OnboardingScreen(
    { logo, title, description, footer, className, children, ...props },
    ref,
  ) {
    const frame = useWindowFrame();
    return (
      <div
        ref={ref}
        data-platform={frame.platform}
        data-window-controls={frame.controls}
        className={cn(styles.screen, className)}
        {...props}
      >
        {/* on Linux the system frame's title bar is above the page, so there is no strip */}
        {frame.platform !== 'linux' && (
          <div className={styles.titleBar}>
            <WindowStart />
            {frame.platform === 'windows' && frame.controls === 'drawn' && (
              <CaptionButtons className={styles.captionButtons} />
            )}
          </div>
        )}
        <main className={styles.column}>
          {(logo || title || description) && (
            <header className={styles.header}>
              {logo}
              {title && <h1 className={styles.title}>{title}</h1>}
              {description && <p className={styles.description}>{description}</p>}
            </header>
          )}
          {children}
        </main>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    );
  },
);
