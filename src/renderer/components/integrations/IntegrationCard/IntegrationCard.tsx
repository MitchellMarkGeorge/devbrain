import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { Info, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { AccountStatus, type AccountState } from '../AccountStatus';
import { Icon } from '../../ui/Icon';
import { ProviderTile, type IntegrationProvider } from '../../entities/ProviderTile';
import styles from './IntegrationCard.module.css';

export const integrationCardVariants = cva(styles.card, {
  variants: {
    state: {
      connected: undefined,
      'needs-reconnect': undefined,
      off: styles.off,
      'coming-later': styles.comingLater,
    },
  },
  defaultVariants: { state: 'connected' },
});

export interface IntegrationCardProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  provider: IntegrationProvider;
  /** the provider's name: "Linear", "Google Calendar" */
  name: ReactNode;
  state: AccountState;
  /** who and how: "Mitchell George · Acme · API key", or what a later provider will bring */
  meta?: ReactNode;
  /** the account's On/Off switch, its label and the "Disconnect…" button, on the right */
  actions?: ReactNode;
  /** an `IntegrationCardAlert` under the account row (a rejected sign-in or API key) */
  alert?: ReactNode;
  /** the `SourceRow`s, listed under "Use this account for" */
  children?: ReactNode;
  /** the heading over the sources */
  sourcesLabel?: ReactNode;
}

/**
 * A connected account on the Integrations page: the provider's tile, name, state pill and account
 * line, the account's switch and "Disconnect…" on the right; then an alert when it needs
 * attention, and its sources under "Use this account for". An account that is off fades its tile
 * and sources; a provider coming later is a dashed outline with no sources.
 */
export const IntegrationCard = forwardRef<HTMLElement, IntegrationCardProps>(
  function IntegrationCard(
    {
      provider,
      name,
      state,
      meta,
      actions,
      alert,
      sourcesLabel = 'Use this account for',
      className,
      children,
      ...props
    },
    ref,
  ) {
    const nameId = useId();
    return (
      <section
        ref={ref}
        aria-labelledby={nameId}
        className={cn(integrationCardVariants({ state }), className)}
        {...props}
      >
        <div className={styles.account}>
          <ProviderTile provider={provider} className={styles.tile} />
          <div className={styles.identity}>
            <div className={styles.nameLine}>
              <h3 id={nameId} className={styles.name}>
                {name}
              </h3>
              <AccountStatus state={state} />
            </div>
            {meta != null && <div className={styles.meta}>{meta}</div>}
          </div>
          {actions != null && <div className={styles.actions}>{actions}</div>}
        </div>
        {alert != null && <div className={styles.alertSlot}>{alert}</div>}
        {children != null && (
          <div className={styles.sources}>
            <div className={styles.sourcesLabel}>{sourcesLabel}</div>
            {children}
          </div>
        )}
      </section>
    );
  },
);

export interface IntegrationCardAlertProps extends ComponentPropsWithoutRef<'div'> {
  /** a "Reconnect" or "Update key" button at the right, or a few buttons in a row */
  action?: ReactNode;
  /**
   * `warning` (amber, the default): something is wrong and syncing has stopped. `info` (blue): an
   * offer the user can take or leave, with nothing broken; announced politely, not as an alert.
   */
  tone?: 'warning' | 'info';
}

/**
 * The notice inside an account card: amber for what went wrong and the button that fixes it, blue
 * for an offer (reattaching the tasks a disconnect kept).
 */
export const IntegrationCardAlert = forwardRef<HTMLDivElement, IntegrationCardAlertProps>(
  function IntegrationCardAlert({ action, tone = 'warning', className, children, ...props }, ref) {
    const info = tone === 'info';
    return (
      <div
        ref={ref}
        role={info ? 'status' : 'alert'}
        className={cn(styles.alert, info && styles.alertInfo, className)}
        {...props}
      >
        <Icon icon={info ? Info : TriangleAlert} size={16} className={styles.alertIcon} />
        <div className={styles.alertText}>{children}</div>
        {action}
      </div>
    );
  },
);

/** The "On" / "Off" word before an account's switch. */
export function IntegrationSwitchLabel({ children }: { children: ReactNode }) {
  return <span className={styles.switchLabel}>{children}</span>;
}
