import { forwardRef, type CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';

export interface InertProps extends useRender.ComponentProps<'div'> {
  /** whether its content is inert (default true): shown, but not focusable, clickable or editable */
  when?: boolean;
}

// without `render`, the element takes no part in layout
const CONTENTS: CSSProperties = { display: 'contents' };

/**
 * Makes its content inert while `when` is true: still drawn, but out of the tab order and the
 * accessibility tree, and deaf to clicks and typing (a trashed note's page, a sidebar sliding out).
 * Without `render` it draws a `display: contents` div, so its children stay their parent's layout
 * items; with one, it marks that element instead: `<Inert when={trashed} render={<Stack gap="8" />}>`.
 *
 * React 18 has no `inert` prop: it passes the attribute through as is, set to `''` while inert.
 */
export const Inert = forwardRef<HTMLDivElement, InertProps>(function Inert(
  { when = true, render, ...props },
  ref,
) {
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      { inert: when ? '' : undefined, style: render ? undefined : CONTENTS } as Record<
        string,
        unknown
      >,
      props,
    ),
  });
});
