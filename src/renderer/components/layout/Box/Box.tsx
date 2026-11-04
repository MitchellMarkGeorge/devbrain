import { forwardRef, type CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { spaceVar, type Space } from '../spacing';
import styles from './Box.module.css';

export const boxVariants = cva(styles.box, {
  variants: {
    surface: {
      background: styles.surfaceBackground,
      card: styles.surfaceCard,
      muted: styles.surfaceMuted,
      popover: styles.surfacePopover,
    },
    radius: {
      md: styles.radiusMd,
      lg: styles.radiusLg,
      xl: styles.radiusXl,
      full: styles.radiusFull,
    },
    /** `default` is a `border` line; `edge` is the translucent outline of raised surfaces */
    border: { default: styles.borderDefault, edge: styles.borderEdge },
  },
});

export interface BoxProps
  extends useRender.ComponentProps<'div'>, VariantProps<typeof boxVariants> {
  padding?: Space;
}

/** A plain block with token-based padding, surface, corners and outline. */
export const Box = forwardRef<HTMLDivElement, BoxProps>(function Box(
  { padding, surface, radius, border, render, ...props }: BoxProps,
  ref,
) {
  const style = padding ? ({ '--box-padding': spaceVar(padding) } as CSSProperties) : undefined;
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>({ className: boxVariants({ surface, radius, border }), style }, props),
  });
});
