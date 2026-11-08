import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import styles from './CardGrid.module.css';

export interface CardGridProps extends ComponentPropsWithoutRef<'div'> {
  /** columns at medium and wide sizes (default 3); compact windows always use two */
  columns?: number;
  /** `sm` 12px, `md` 16px (the Notes and Projects card views) */
  gap?: 'sm' | 'md';
}

/**
 * Cards in equal columns: the Notes and Projects card views. In compact windows it drops to two
 * columns (README "Window sizes").
 */
export const CardGrid = forwardRef<HTMLDivElement, CardGridProps>(function CardGrid(
  { columns = 3, gap = 'sm', className, style, ...props },
  ref,
) {
  const { size } = useWorkspaceShell();
  const shown = size === 'compact' ? Math.min(columns, 2) : columns;
  return (
    <div
      ref={ref}
      data-gap={gap}
      className={cn(styles.grid, className)}
      style={{ '--card-columns': shown, ...style } as CSSProperties}
      {...props}
    />
  );
});
