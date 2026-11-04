import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './Kbd.module.css';

export type KbdProps = useRender.ComponentProps<'kbd'>;

/** A keyboard key, for help, empty states and tooltips: `<Kbd>⌘K</Kbd>`. */
export function Kbd({ render, ...props }: KbdProps) {
  return useRender({
    defaultTagName: 'kbd',
    render,
    props: mergeProps<'kbd'>({ className: styles.kbd }, props),
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
