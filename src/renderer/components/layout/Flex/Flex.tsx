import type { CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { spaceVar, type Space } from '../spacing';
import styles from './Flex.module.css';

export const flexVariants = cva(styles.flex, {
  variants: {
    direction: {
      row: styles.row,
      column: styles.column,
      'row-reverse': styles.rowReverse,
      'column-reverse': styles.columnReverse,
    },
    align: {
      start: styles.alignStart,
      center: styles.alignCenter,
      end: styles.alignEnd,
      baseline: styles.alignBaseline,
      stretch: styles.alignStretch,
    },
    justify: {
      start: styles.justifyStart,
      center: styles.justifyCenter,
      end: styles.justifyEnd,
      between: styles.justifyBetween,
    },
    wrap: { wrap: styles.wrap, nowrap: styles.nowrap },
    inline: { true: styles.inline },
    /** fill the remaining space of a parent flex row (and allow truncation inside) */
    grow: { true: styles.grow },
  },
  defaultVariants: { direction: 'row' },
});

export interface FlexProps
  extends useRender.ComponentProps<'div'>,
    VariantProps<typeof flexVariants> {
  /** a step of the 4px spacing scale */
  gap?: Space;
}

/** A flex container on the spacing scale: `<Flex gap="2" align="center">`. */
export function Flex({
  direction,
  align,
  justify,
  wrap,
  inline,
  grow,
  gap,
  render,
  ...props
}: FlexProps) {
  const style = gap ? ({ '--flex-gap': spaceVar(gap) } as CSSProperties) : undefined;
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      { className: flexVariants({ direction, align, justify, wrap, inline, grow }), style },
      props,
    ),
  });
}

/** A vertical `Flex`: `<Stack gap="4">`. */
export function Stack(props: Omit<FlexProps, 'direction'>) {
  return <Flex direction="column" {...props} />;
}
