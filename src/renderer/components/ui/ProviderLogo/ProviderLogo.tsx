import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { PROVIDER_LABELS, type Provider } from '../types';
import styles from './ProviderLogo.module.css';

/** The providers' marks on a 32-unit tile (brand assets: kept as given, never redrawn). */
const MARKS: Record<Provider, string> = {
  linear:
    'M9.16 10.14A8.99 8.99 0 0 1 25 16.01c0 2.73-1.21 5.18-3.13 6.83L9.17 10.14ZM8.36 11.22l12.42 12.42c-.39.25-.81.47-1.24.65L7.71 12.46c.19-.43.4-.85.65-1.24ZM7.24 13.87l10.89 10.89c-.53.13-1.08.21-1.65.24L7 15.52c.03-.56.11-1.11.24-1.65ZM7.11 17.52l7.37 7.37a9 9 0 0 1-7.37-7.37Z',
  github:
    'M16 7.22a9 9 0 0 0-2.85 17.54c.45.08.62-.19.62-.43l-.01-1.53c-2.5.54-3.03-1.21-3.03-1.21-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.37 2.11.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.14.08-2.38 0 0 .75-.24 2.48.92a8.5 8.5 0 0 1 4.5 0c1.71-1.16 2.46-.92 2.46-.92.49 1.24.18 2.15.09 2.38.58.63.92 1.44.92 2.42 0 3.46-2.1 4.22-4.11 4.44.32.27.61.82.61 1.66l-.01 2.46c0 .24.16.52.62.43A9 9 0 0 0 16 7.22Z',
};

export const providerLogoVariants = cva(styles.logo, {
  variants: { provider: { linear: styles.linear, github: styles.github } },
  defaultVariants: { provider: 'linear' },
});

export interface ProviderLogoProps {
  provider?: Provider;
  /** 12px in pills (the default), 16px in hover cards */
  size?: number;
  className?: string;
}

/** The tile of the service a synced task comes from: Linear or GitHub. */
export function ProviderLogo({ provider = 'linear', size = 12, className }: ProviderLogoProps) {
  return (
    <svg
      className={cn(providerLogoVariants({ provider }), className)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={PROVIDER_LABELS[provider]}
    >
      <rect className={styles.ground} width={32} height={32} rx={8} />
      <path className={styles.ink} d={MARKS[provider]} />
    </svg>
  );
}
