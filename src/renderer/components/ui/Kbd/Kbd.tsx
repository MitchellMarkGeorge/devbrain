import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { useFormatKeys } from '../../lib/platform';
import styles from './Kbd.module.css';

export const kbdVariants = cva(styles.kbd, {
  variants: {
    /**
     * `default` (`muted`) on the page, cards and tooltips; `raised` (`border-strong`) on popovers,
     * where `muted` disappears in dark: the ⌘K search, its result rows and dialog footers
     */
    variant: { default: undefined, raised: styles.raised },
  },
  defaultVariants: { variant: 'default' },
});

export interface KbdProps
  extends useRender.ComponentProps<'kbd'>, VariantProps<typeof kbdVariants> {}

/**
 * A keyboard key, for help, empty states and tooltips: `<Kbd>⌘K</Kbd>`. Write keys as on macOS:
 * a text child reads "Ctrl+K" on Windows and Linux (`formatKeys`).
 */
export function Kbd({ variant, render, children, ...props }: KbdProps) {
  const formatKeys = useFormatKeys();
  return useRender({
    defaultTagName: 'kbd',
    render,
    props: mergeProps<'kbd'>({ className: kbdVariants({ variant }) }, props, {
      children: typeof children === 'string' ? formatKeys(children) : children,
    }),
  });
}

export type KbdGroupProps = useRender.ComponentProps<'span'>;

/** Keys pressed together, 4px apart: `<KbdGroup><Kbd>⌘</Kbd><Kbd>D</Kbd></KbdGroup>`. */
export function KbdGroup({ render, ...props }: KbdGroupProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ className: styles.group }, props),
  });
}
