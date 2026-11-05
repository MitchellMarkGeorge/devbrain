import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';
import { useAppShell } from '../AppShell/context';
import styles from './CardGrid.module.css';

export interface CardGridProps extends ComponentPropsWithoutRef<'div'> {
  /** columns at medium and wide sizes (default 3); compact windows always use two */
  columns?: number;
  /**
   * One row only (Home's projects and notes): the cards that don't fit hide, and the section's
   * "All …" link leads to the rest.
   */
  singleRow?: boolean;
  /** `sm` 12px (Home), `md` 16px (the Notes and Projects card views) */
  gap?: 'sm' | 'md';
}

/**
 * Cards in equal columns, 12px apart: Home's projects and recent notes, the Notes and Projects
 * card views. In compact windows it drops to two columns (README "Window sizes").
 */
export const CardGrid = forwardRef<HTMLDivElement, CardGridProps>(function CardGrid(
  { columns = 3, singleRow, gap = 'sm', className, style, ...props },
  ref,
) {
  const { size } = useAppShell();
  const shown = size === 'compact' ? Math.min(columns, 2) : columns;
  return (
    <div
      ref={ref}
      data-single-row={singleRow ? '' : undefined}
      data-gap={gap}
      className={cn(styles.grid, className)}
      style={{ '--card-columns': shown, ...style } as CSSProperties}
      {...props}
    />
  );
});
