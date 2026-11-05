import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { TrafficLightsMode } from '../../shell/AppShell';
import { TrafficLights } from '../../shell/WindowBar';
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
  trafficLights?: TrafficLightsMode;
}

/**
 * The window before a workspace is open (splash, Welcome, Create workspace): no sidebar, the
 * traffic lights alone in a draggable top strip, and one centred column: the mark, the title, a
 * line, then the content (a `WorkspaceList`, buttons, a card), with an optional footer link.
 */
export const OnboardingScreen = forwardRef<HTMLDivElement, OnboardingScreenProps>(
  function OnboardingScreen(
    { logo, title, description, footer, trafficLights, className, children, ...props },
    ref,
  ) {
    return (
      <div ref={ref} className={cn(styles.screen, className)} {...props}>
        <div className={styles.titleBar}>
          <TrafficLights mode={trafficLights} />
        </div>
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
