import type { CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import styles from './WorkspaceTile.module.css';

import { SWATCHES, type Swatch } from '../../types';

export { SWATCHES, type Swatch };

export const workspaceTileVariants = cva(styles.tile, {
  variants: {
    color: {
      red: styles.red,
      amber: styles.amber,
      green: styles.green,
      blue: styles.blue,
      indigo: styles.indigo,
      pink: styles.pink,
    },
    large: { true: styles.large },
  },
});

export interface WorkspaceTileProps
  extends
    Omit<useRender.ComponentProps<'span'>, 'color'>,
    Omit<VariantProps<typeof workspaceTileVariants>, 'large'> {
  /** the workspace's first letter */
  letter: string;
  /** 20px in the sidebar and switcher (6px corners), 60–72px on onboarding (16px corners) */
  size?: number;
}

/** A workspace's letter on the 900 step of its swatch colour. */
export function WorkspaceTile({ letter, color, size = 20, render, ...props }: WorkspaceTileProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>(
      {
        className: workspaceTileVariants({ color, large: size > 40 }),
        style: { '--tile-size': `${size}px` } as CSSProperties,
        'aria-hidden': true,
        children: letter.slice(0, 1).toUpperCase(),
      },
      props,
    ),
  });
}
