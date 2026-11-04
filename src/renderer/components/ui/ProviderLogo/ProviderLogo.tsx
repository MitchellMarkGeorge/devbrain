import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { PROVIDER_LABELS, type Provider } from '../types';
import { MARKS } from './marks';
import styles from './ProviderLogo.module.css';

export const providerLogoVariants = cva(styles.logo, {
  variants: { provider: { linear: styles.linear, github: styles.github } },
  defaultVariants: { provider: 'linear' },
});

export interface ProviderLogoProps {
  provider?: Provider;
  /** 12px in pills (the default), 16px in hover cards and synced badges */
  size?: number;
  className?: string;
}

/**
 * The mark of the service a synced task comes from, on its own and in one colour, as an icon in
 * tight places (pills, badges): Linear's logomark in its brand neutrals (Mercury White in dark,
 * Nordic Gray in light), as Linear's guidelines ask for tight layouts; GitHub's mark in
 * `foreground-strong`. The mark fills the box less a 1px margin, like the Lucide icons beside it.
 */
export function ProviderLogo({ provider = 'linear', size = 12, className }: ProviderLogoProps) {
  return (
    <svg
      className={cn(providerLogoVariants({ provider }), className)}
      width={size}
      height={size}
      viewBox="-1 -1 20 20"
      role="img"
      aria-label={PROVIDER_LABELS[provider]}
    >
      <path d={MARKS[provider]} />
    </svg>
  );
}
