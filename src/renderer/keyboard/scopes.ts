/**
 * Where keys apply. The active scopes form a stack, from the outside in:
 *
 * - `global`: always, unless a modal scope is open;
 * - `page`: the page's content;
 * - `list`, `board`, `calendar`, `sheet`: a region of the page;
 * - `dialog`: a modal, which blocks every scope under it, `global` included;
 * - `editor`: a rich text editor.
 *
 * A `<KeyScope name>` makes its subtree a scope while focus is inside it. The innermost scope's
 * binding wins.
 */
export type Scope =
  | 'global'
  | 'page'
  | 'list'
  | 'board'
  | 'calendar'
  | 'sheet'
  | 'dialog'
  | 'editor';

export const SCOPES: readonly Scope[] = [
  'global',
  'page',
  'list',
  'board',
  'calendar',
  'sheet',
  'dialog',
  'editor',
];

/** the attribute `KeyScope` sets on its element: the scope's name */
export const SCOPE_ATTRIBUTE = 'data-key-scope';
/** set on a modal scope's element: while one is in the document, nothing outside it fires */
export const MODAL_ATTRIBUTE = 'data-key-modal';

function isScope(name: string | null): name is Scope {
  return name !== null && (SCOPES as readonly string[]).includes(name);
}

/**
 * The scopes active for a key pressed on `target` (the focused element), innermost first and
 * ending with `global`.
 *
 * While a modal scope is in the document, only scopes inside the last one (the top-most, as
 * dialogs portal to the end of `<body>` in the order they open) are active; with focus on an
 * element around it (the dialog's popup), only the modal scope is; with focus elsewhere, none are.
 */
export function activeScopes(target: Element | null, doc: Document): Scope[] {
  const found: { scope: Scope; element: Element }[] = [];
  for (let element = target; element; element = element.parentElement) {
    const name = element.getAttribute(SCOPE_ATTRIBUTE);
    if (isScope(name)) found.push({ scope: name, element });
  }
  const modals = doc.querySelectorAll(`[${MODAL_ATTRIBUTE}]`);
  const modal = modals.length > 0 ? modals[modals.length - 1] : undefined;
  let scopes: Scope[];
  if (modal) {
    const index = found.findIndex(({ element }) => element === modal);
    // a dialog's popup takes focus itself, and its scope sits inside it
    if (index === -1) {
      const around = target && target !== doc.body && target !== doc.documentElement;
      return around && target.contains(modal) ? [modal.getAttribute(SCOPE_ATTRIBUTE) as Scope] : [];
    }
    scopes = found.slice(0, index + 1).map(({ scope }) => scope);
  } else {
    scopes = [...found.map(({ scope }) => scope), 'global'];
  }
  return [...new Set(scopes)];
}
