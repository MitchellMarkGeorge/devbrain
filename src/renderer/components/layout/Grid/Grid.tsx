import type { CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { spaceVar, type Space } from '../spacing';
import styles from './Grid.module.css';

export const gridVariants = cva(styles.grid, {
  variants: {
    align: {
      start: styles.alignStart,
      center: styles.alignCenter,
      end: styles.alignEnd,
      stretch: styles.alignStretch,
    },
  },
});

export interface GridProps
  extends useRender.ComponentProps<'div'>, VariantProps<typeof gridVariants> {
  /** a column count (equal columns) or a `grid-template-columns` value */
  columns?: number | string;
  /** equal columns, as many as fit, none narrower than this (e.g. `240px` for card grids) */
  minColumnWidth?: string;
  gap?: Space;
}

/** A CSS grid on the spacing scale: `<Grid columns={3} gap="4">`, `<Grid minColumnWidth="240px">`. */
export function Grid({ columns, minColumnWidth, gap, align, render, ...props }: GridProps) {
  const template = minColumnWidth
    ? `repeat(auto-fill, minmax(${minColumnWidth}, 1fr))`
    : typeof columns === 'number'
      ? `repeat(${columns}, minmax(0, 1fr))`
      : columns;
  const style = {
    ...(gap && { '--grid-gap': spaceVar(gap) }),
    ...(template && { '--grid-columns': template }),
  } as CSSProperties;
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>({ className: gridVariants({ align }), style }, props),
  });
}
