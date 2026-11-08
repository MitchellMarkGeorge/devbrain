import type { CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { MODAL_ATTRIBUTE, SCOPE_ATTRIBUTE, type Scope } from './scopes';

export interface KeyScopeProps extends useRender.ComponentProps<'div'> {
  name: Scope;
  /** blocks every scope outside it while mounted; on for `dialog` */
  modal?: boolean;
}

// without `render`, the scope's own element takes no part in layout
const CONTENTS: CSSProperties = { display: 'contents' };

/**
 * Makes its subtree a key scope, active while focus is inside it. Without `render` it draws a
 * `display: contents` div; with one, it marks that element instead:
 * `<KeyScope name="list" render={<div className={styles.list} />}>`.
 *
 * Put a dialog's scope inside its popup (`DialogContent`), as the popup portals out of the page.
 */
export function KeyScope({ name, modal = name === 'dialog', render, ...props }: KeyScopeProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        [SCOPE_ATTRIBUTE]: name,
        [MODAL_ATTRIBUTE]: modal ? '' : undefined,
        style: render ? undefined : CONTENTS,
      } as Record<string, unknown>,
      props,
    ),
  });
}
