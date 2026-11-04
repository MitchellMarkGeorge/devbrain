import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Badge, type BadgeProps } from '../Badge';
import { ProviderLogo } from '../ProviderLogo';
import type { Provider } from '../types';
import styles from './SourcePill.module.css';

export const sourcePillVariants = cva(styles.source, {
  variants: { compact: { true: styles.compact } },
});

export interface SourcePillProps
  extends
    Omit<BadgeProps, 'variant' | 'icon' | 'iconColor' | 'barColor' | 'muted' | 'prefix'>,
    VariantProps<typeof sourcePillVariants> {
  /** linear by default */
  provider?: Provider;
}

/**
 * Where a synced task comes from and its key, read as one unit: "[Linear] ENG-124". Replaces the
 * bare key in task rows, board cards (`compact`, 20px) and search results. Local tasks have none.
 */
export const SourcePill = forwardRef<HTMLElement, SourcePillProps>(function SourcePill(
  { provider = 'linear', compact, className, ...props },
  ref,
) {
  return (
    <Badge
      ref={ref}
      variant="outline"
      interactive
      muted
      icon={<ProviderLogo provider={provider} size={12} />}
      className={cn(sourcePillVariants({ compact }), className)}
      {...props}
    />
  );
});
