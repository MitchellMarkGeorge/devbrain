import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';
import { MODAL_ATTRIBUTE } from './scopes';

/**
 * The elements registered for Vim's `f` hints, with what typing their label does. One per
 * `KeyboardProvider`; `useHintTarget` adds to it.
 */
export class HintRegistry {
  private readonly targets = new Map<Element, () => void>();

  /** registers `element`; returns the function that unregisters it */
  register(element: Element, action: () => void): () => void {
    this.targets.set(element, action);
    return () => {
      if (this.targets.get(element) === action) this.targets.delete(element);
    };
  }

  get(element: Element): (() => void) | undefined {
    return this.targets.get(element);
  }

  elements(): Element[] {
    return [...this.targets.keys()];
  }
}

export const HintContext = createContext<HintRegistry | null>(null);

/**
 * Registers an element for Vim's `f` hints: typing the label drawn over it runs `action` (a row's
 * open). Rows and cards call it, as they aren't buttons or links; buttons, links and fields are
 * found without it, and a click is what their label does. A registered element's own buttons and
 * pills get no label of their own, as in Figma (`7703:57705`). Outside a `KeyboardProvider`, or
 * with no `action`, it does nothing.
 */
export function useHintTarget(
  ref: RefObject<HTMLElement | null>,
  action: (() => void) | undefined,
): void {
  const registry = useContext(HintContext);
  const latest = useRef(action);
  useEffect(() => {
    latest.current = action;
  });
  const has = action !== undefined;
  useEffect(() => {
    const element = ref.current;
    if (!registry || !element || !has) return;
    return registry.register(element, () => latest.current?.());
  }, [registry, ref, has]);
}

/** The keys labels are made of: the home row, as Figma's `AA`, `AS`, `AD`. */
export const HINT_ALPHABET = 'asdfghjkl';

/**
 * `count` labels, all of one length (one letter while the alphabet has enough, two after), in
 * order: `a`, `s`, … then `aa`, `as`, `ad`, … No label is the start of another.
 */
export function hintLabels(count: number, alphabet = HINT_ALPHABET): string[] {
  if (count <= 0) return [];
  let length = 1;
  while (alphabet.length ** length < count) length += 1;
  const labels: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let label = '';
    for (let n = i, place = 0; place < length; place += 1) {
      label = alphabet[n % alphabet.length] + label;
      n = Math.floor(n / alphabet.length);
    }
    labels.push(label);
  }
  return labels;
}

// what can be clicked or typed in without registering: buttons, links, fields, tabs, switches
const NATIVE = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(', ');
// anything else made focusable to be used (a calendar event, a card), unless it holds controls
// of its own: a list's or a scroller's own tab stop isn't a target
const FOCUSABLE = '[tabindex="0"]:not([role="grid"]):not([role="list"]):not([role="region"])';
const TEXT_FIELD =
  'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea';

/** A target `f` labels: an element on screen, and what its label does. */
export interface HintTarget {
  element: HTMLElement;
  activate: () => void;
}

function shown(element: HTMLElement, view: { width: number; height: number }): boolean {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if (element.matches(':disabled, [aria-disabled="true"]')) return false;
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility()) return false;
  const rect = element.getBoundingClientRect();
  // happy-dom lays nothing out: an element with no box counts as shown there, never in Chromium
  if (rect.width === 0 && rect.height === 0) return !hasLayout(element);
  return rect.bottom > 0 && rect.right > 0 && rect.top < view.height && rect.left < view.width;
}

// whether the document lays elements out (a browser does; the tests' happy-dom doesn't)
function hasLayout(element: HTMLElement): boolean {
  return element.ownerDocument.body.getBoundingClientRect().width > 0;
}

/** Clicks an element, or focuses a text field. */
export function activateElement(element: HTMLElement): void {
  if (element.matches(TEXT_FIELD) || element.isContentEditable) {
    element.focus();
    return;
  }
  element.focus({ preventScroll: true });
  element.click();
}

/**
 * The targets on screen for `f`, in document order: the registered elements and the buttons,
 * links and fields outside them. With a dialog open, only those in the top-most one.
 */
export function collectHints(doc: Document, registry: HintRegistry): HintTarget[] {
  const view = {
    width: doc.defaultView?.innerWidth ?? Infinity,
    height: doc.defaultView?.innerHeight ?? Infinity,
  };
  const modals = doc.querySelectorAll(`[${MODAL_ATTRIBUTE}]`);
  const modal = modals.length > 0 ? modals[modals.length - 1] : undefined;
  // a dialog's scope sits inside its popup: the popup is the element that holds it
  const within = modal
    ? (modal.closest('[role="dialog"], [role="alertdialog"]') ?? modal)
    : doc.body;
  const registered = registry
    .elements()
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
  const inRegistered = (element: Element) =>
    registered.some((owner) => owner !== element && owner.contains(element));
  const candidates = new Set<HTMLElement>(registered.filter((el) => within.contains(el)));
  for (const element of within.querySelectorAll<HTMLElement>(NATIVE)) {
    if (!inRegistered(element)) candidates.add(element);
  }
  for (const element of within.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (candidates.has(element) || inRegistered(element)) continue;
    if (element.querySelector(`${NATIVE}, ${FOCUSABLE}`)) continue;
    if (registered.some((owner) => element.contains(owner))) continue;
    candidates.add(element);
  }
  return [...candidates]
    .filter((element) => element.isConnected && shown(element, view))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((element) => ({
      element,
      activate: registry.get(element) ?? (() => activateElement(element)),
    }));
}
