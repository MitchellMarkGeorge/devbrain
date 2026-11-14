import type { ComponentPropsWithoutRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { INTEGRATION_PROVIDER_LABELS, type IntegrationProvider } from '../../types';
// Linear's company icon, as Linear publishes it; served as a file (the page's CSP allows no data: URLs)
import linearIcon from '@renderer/assets/brand/linear-icon.svg?no-inline';
import { GoogleCalendarLogo, MARKS } from '../ProviderLogo/marks';
import styles from './ProviderTile.module.css';

export { INTEGRATION_PROVIDER_LABELS, type IntegrationProvider } from '../../types';

export const providerTileVariants = cva(styles.tile, {
  variants: {
    provider: {
      linear: styles.linear,
      'google-calendar': styles.google,
      github: styles.github,
    },
  },
  defaultVariants: { provider: 'linear' },
});

export interface ProviderTileProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  provider: IntegrationProvider;
  /** 32px (the default) on the Integrations page */
  size?: number;
}

/**
 * A provider's brand at tile size: Linear's company icon as Linear publishes it, given the tile's
 * corners (8px at 32px), as Linear's guidelines allow; Google Calendar's own logo in its colours,
 * as Google publishes it (a tile already); and GitHub's mark on a neutral ground. Carries the
 * provider's name for screen readers.
 */
export function ProviderTile({
  provider,
  size = 32,
  className,
  style,
  ...props
}: ProviderTileProps) {
  return (
    <span
      role="img"
      aria-label={INTEGRATION_PROVIDER_LABELS[provider]}
      className={cn(providerTileVariants({ provider }), className)}
      style={{ width: size, height: size, borderRadius: size / 4, ...style }}
      {...props}
    >
      {provider === 'linear' ? (
        <img src={linearIcon} width={size} height={size} alt="" draggable={false} />
      ) : provider === 'google-calendar' ? (
        <GoogleCalendarLogo size={size} />
      ) : (
        <svg width={size * 0.5625} height={size * 0.5625} viewBox="0 0 18 18" aria-hidden>
          <path d={MARKS[provider]} fill="currentColor" />
        </svg>
      )}
    </span>
  );
}
