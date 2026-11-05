import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Badge, type BadgeProps } from '../../ui/Badge';
import { ProviderLogo } from '../ProviderLogo';
import type { Provider } from '../../types';
import styles from './SourcePill.module.css';

export const sourcePillVariants = cva(styles.source);

export interface SourcePillProps extends Omit<
  BadgeProps,
  'variant' | 'icon' | 'iconColor' | 'barColor' | 'muted' | 'prefix'
> {
  /** linear by default */
  provider?: Provider;
}

/**
 * Where a synced task comes from and its key, read as one unit: "[Linear] ENG-124". Replaces the
 * bare key in task rows, board cards and search results. Local tasks have none.
 */
export const SourcePill = forwardRef<HTMLElement, SourcePillProps>(function SourcePill(
  { provider = 'linear', className, ...props },
  ref,
) {
  return (
    <Badge
      ref={ref}
      variant="outline"
      interactive
      muted
      icon={<ProviderLogo provider={provider} size={12} />}
      className={cn(sourcePillVariants(), className)}
      {...props}
    />
  );
});
