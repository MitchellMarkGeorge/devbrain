import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cva } from 'class-variance-authority';
import { CircleSlash, Clock, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { FilledCheck } from '../../entities/StatusIcon';
import styles from './AccountStatus.module.css';

/** A connected account's state on the Integrations page. */
export type AccountState = 'connected' | 'needs-reconnect' | 'off' | 'coming-later';

export const ACCOUNT_STATE_LABELS: Record<AccountState, string> = {
  connected: 'Connected',
  'needs-reconnect': 'Needs reconnect',
  off: 'Off',
  'coming-later': 'Coming later',
};

export const accountStatusVariants = cva(styles.status, {
  variants: {
    state: {
      connected: styles.connected,
      'needs-reconnect': styles.needsReconnect,
      off: styles.off,
      'coming-later': styles.comingLater,
    },
  },
  defaultVariants: { state: 'connected' },
});

export interface AccountStatusProps extends ComponentPropsWithoutRef<'span'> {
  state: AccountState;
}

/**
 * An account's state as an outlined 24px pill beside its name: Connected (green filled check),
 * Needs reconnect (amber warning), Off (grey slashed circle), Coming later (dashed, clock).
 */
export const AccountStatus = forwardRef<HTMLSpanElement, AccountStatusProps>(function AccountStatus(
  { state, className, children, ...props },
  ref,
) {
  const glyph =
    state === 'connected' ? (
      <FilledCheck size={12} className={styles.glyph} aria-hidden />
    ) : (
      <Icon
        icon={state === 'needs-reconnect' ? TriangleAlert : state === 'off' ? CircleSlash : Clock}
        size={12}
        className={styles.glyph}
      />
    );
  return (
    <span ref={ref} className={cn(accountStatusVariants({ state }), className)} {...props}>
      {glyph}
      {children ?? ACCOUNT_STATE_LABELS[state]}
    </span>
  );
});
