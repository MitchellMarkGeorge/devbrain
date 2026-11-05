import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { ProviderLogo } from '../ProviderLogo';
import type { Provider } from '../../types';
import styles from './SyncedBadge.module.css';

export const syncedBadgeVariants = cva(styles.badge, {
  variants: {
    /**
     * `synced`: an outlined pill under a synced item's title. `detached`: quiet text, for a
     * local copy that still remembers where it came from.
     */
    state: { synced: styles.synced, detached: styles.detached },
  },
  defaultVariants: { state: 'synced' },
});

export interface SyncedBadgeProps
  extends ComponentPropsWithoutRef<'span'>, VariantProps<typeof syncedBadgeVariants> {
  /** whose mark leads the badge; linear by default */
  provider?: Provider;
  /** a mark `ProviderLogo` doesn't draw, 16px: Google Calendar's `<GoogleCalendarLogo size={16} />` */
  logo?: ReactNode;
  /** the provider and key: "Linear · ENG-124", "Google Calendar · Engineering" */
  children: ReactNode;
}

/**
 * Where a synced task or event comes from, under its title in a sheet or on its page: the
 * provider's 16px mark, then its name and key. Not interactive; "Open in Linear" sits below.
 */
export const SyncedBadge = forwardRef<HTMLSpanElement, SyncedBadgeProps>(function SyncedBadge(
  { state, provider = 'linear', logo, className, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      data-state={state ?? 'synced'}
      className={cn(syncedBadgeVariants({ state }), className)}
      {...props}
    >
      <span className={styles.logo}>{logo ?? <ProviderLogo provider={provider} size={16} />}</span>
      <span className={styles.label}>{children}</span>
    </span>
  );
});
