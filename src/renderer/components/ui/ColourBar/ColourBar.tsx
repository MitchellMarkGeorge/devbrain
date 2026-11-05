import type { CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { resolveColor, type Swatch } from '../../types';
import styles from './ColourBar.module.css';

export interface ColourBarProps extends Omit<useRender.ComponentProps<'span'>, 'color'> {
  /** the calendar's colour: a swatch name or any CSS colour (defaults to green) */
  color?: Swatch | string;
  /**
   * 12px in pills, badges and board cards (Figma's `ColourBar`); taller where it stands beside
   * more than one line: 16px in the sidebar's 16px icon slot, 20px in an event row
   */
  height?: number;
}

/**
 * A calendar's colour as a 3px-wide bar with 2px corners: how an event shows which calendar it
 * belongs to, in a Badge or EntityPill, a sidebar item, an event row or a board card. Decorative:
 * the event's name says what it is.
 */
export function ColourBar({ color, height = 12, render, style, ...props }: ColourBarProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>(
      {
        'data-slot': 'colour-bar',
        className: styles.bar,
        'aria-hidden': true,
        style: {
          '--colour-bar-color': resolveColor(color),
          '--colour-bar-height': `${height}px`,
          ...style,
        } as CSSProperties,
      } as useRender.ElementProps<'span'>,
      props,
    ),
  });
}
