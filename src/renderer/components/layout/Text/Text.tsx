import { forwardRef, type CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import styles from './Text.module.css';

export const textVariants = cva(styles.text, {
  variants: {
    /** `sm` (14px) for rows, controls and descriptions; `xs` (12px) for metadata and badges */
    size: { xs: styles.sizeXs, sm: styles.sizeSm, base: styles.sizeBase, lg: styles.sizeLg },
    weight: {
      normal: styles.weightNormal,
      medium: styles.weightMedium,
      semibold: styles.weightSemibold,
    },
    /**
     * `default` body text, `strong` titles and row names, `muted` labels and descriptions,
     * `subtle` metadata a reader can skip; `today` and `overdue` the date colours, `onTrack`
     * good news ("Nothing's due today")
     */
    tone: {
      inherit: styles.toneInherit,
      default: styles.toneDefault,
      strong: styles.toneStrong,
      muted: styles.toneMuted,
      subtle: styles.toneSubtle,
      destructive: styles.toneDestructive,
      today: styles.toneToday,
      overdue: styles.toneOverdue,
      onTrack: styles.toneOnTrack,
    },
    align: { start: styles.alignStart, center: styles.alignCenter, end: styles.alignEnd },
    /** one line ending in "…" */
    truncate: { true: styles.truncate },
    mono: { true: styles.mono },
    /** tabular numerals, for times and counts that line up */
    tabular: { true: styles.tabular },
    strike: { true: styles.strike },
  },
  defaultVariants: { size: 'sm', weight: 'normal', tone: 'inherit' },
});

export interface TextProps
  extends useRender.ComponentProps<'span'>, VariantProps<typeof textVariants> {
  /** clamp to this many lines, ending in "…" */
  lineClamp?: number;
}

/**
 * Running text on the type scale. A `span` by default; `render={<p />}` for a paragraph.
 * `<Text size="xs" tone="muted">Edited 2h ago</Text>`
 */
export const Text = forwardRef<HTMLSpanElement, TextProps>(function Text(
  {
    size,
    weight,
    tone,
    align,
    truncate,
    mono,
    tabular,
    strike,
    lineClamp,
    render,
    ...props
  }: TextProps,
  ref,
) {
  const className = cn(
    textVariants({ size, weight, tone, align, truncate, mono, tabular, strike }),
    lineClamp && styles.clamp,
  );
  const style = lineClamp ? ({ '--text-clamp': lineClamp } as CSSProperties) : undefined;
  return useRender({
    ref,
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ className, style }, props),
  });
});
