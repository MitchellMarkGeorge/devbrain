import type { CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cssColor, type Swatch } from '../../types';
import styles from './SwatchDot.module.css';

export interface SwatchDotProps extends Omit<useRender.ComponentProps<'span'>, 'color'> {
  /** a swatch name or any CSS colour */
  color: Swatch | string;
}

/**
 * A colour as an 8px dot centred in a 12px slot, the size of a pill's glyph: the colour pill of
 * the create and edit dialogs (`<EntityPill glyph={<SwatchDot color="blue" />}>Blue</EntityPill>`).
 * Decorative: the pill's label names the colour.
 */
export function SwatchDot({ color, render, style, ...props }: SwatchDotProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>(
      {
        'data-slot': 'swatch-dot',
        className: styles.slot,
        'aria-hidden': true,
        style: { '--swatch-dot-color': cssColor(color), ...style } as CSSProperties,
      } as useRender.ElementProps<'span'>,
      props,
    ),
  });
}
