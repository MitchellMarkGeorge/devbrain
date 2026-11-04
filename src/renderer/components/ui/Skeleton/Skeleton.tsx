import type { CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import styles from './Skeleton.module.css';

export const skeletonVariants = cva(styles.skeleton, {
  variants: {
    /**
     * `block` (a text bar, 6px corners), `icon` (a 16px icon's square, 4px), `circle` (pills,
     * avatars), or `card` (the card's fill and outline)
     */
    shape: { block: undefined, icon: styles.icon, circle: styles.circle, card: styles.card },
  },
  defaultVariants: { shape: 'block' },
});

export interface SkeletonProps
  extends useRender.ComponentProps<'div'>, VariantProps<typeof skeletonVariants> {
  width?: number | string;
  height?: number | string;
}

/** A pulsing placeholder in the shape of what loads. */
export function Skeleton({ shape, width, height, render, style, ...props }: SkeletonProps) {
  const size: CSSProperties = { width, height, ...style };
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      { className: skeletonVariants({ shape }), style: size, 'aria-hidden': true },
      props,
    ),
  });
}
