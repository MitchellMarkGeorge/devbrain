import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './VisuallyHidden.module.css';

export type VisuallyHiddenProps = useRender.ComponentProps<'span'>;

/** Text for screen readers only: a label for an icon-only control or a live region. */
export function VisuallyHidden({ render, ...props }: VisuallyHiddenProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ className: styles.hidden }, props),
  });
}
