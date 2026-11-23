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
  /**
   * a detached copy (`isDetached`): the mark at half strength and a dashed outline, and
   * "detached" in its tooltip and accessible name
   */
  detached?: boolean;
}

/**
 * Where a synced or detached task or project comes from and its key, read as one unit:
 * "[Linear] ENG-124". Replaces the bare key in task rows, board cards and search results, and
 * names the provider on a project's row and header. Local items have none.
 */
export const SourcePill = forwardRef<HTMLElement, SourcePillProps>(function SourcePill(
  { provider = 'linear', detached = false, className, children, ...props },
  ref,
) {
  const label = typeof children === 'string' ? children : undefined;
  return (
    <Badge
      ref={ref}
      variant="outline"
      interactive
      muted
      data-detached={detached || undefined}
      icon={
        detached ? (
          <span className={styles.fadedMark}>
            <ProviderLogo provider={provider} size={12} />
          </span>
        ) : (
          <ProviderLogo provider={provider} size={12} />
        )
      }
      className={cn(sourcePillVariants(), className)}
      {...(detached &&
        label && { title: `${label} · Detached`, 'aria-label': `${label}, detached` })}
      {...props}
    >
      {children}
    </Badge>
  );
});
