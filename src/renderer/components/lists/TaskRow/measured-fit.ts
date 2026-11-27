import { useLayoutEffect, type RefObject } from 'react';
import { fitRow, type FitGroup, type FitInput } from './fit';

/**
 * EXPERIMENT, story-only (`data-fit` on a TaskRow): the row's stacking and spreading with the
 * widths worked out here and set on the parts, in place of the flex line's shrink
 * factors and `useSpreadPills`' before-and-after measuring.
 *
 * What is read from the page, and when:
 *
 * - Natural widths (the title's and each slot's, unconstrained) and their minimums (the
 *   stylesheet's `min-width`s): once per row, and again only when its text changes or a font
 *   loads. Every row waiting is measured in one pass (mark all, read all, write all), so a list
 *   mounting forty rows lays out once for it, before the first paint.
 * - The content's width: from one ResizeObserver shared by every row, which reports after layout,
 *   so nothing is read for it.
 *
 * A resize or a spread is then arithmetic (`fitRow`) and a write per part. The spread's animation
 * is a plain transition of those widths.
 */

// the group of pills that is spread: pointed at, holding keyboard focus, or with its hover card open
const SPREAD_GROUP = '[data-pills]:is(:hover, :has(:focus-visible, [data-popup-open]))';

interface RowState {
  content: HTMLElement;
  name: HTMLElement;
  title: HTMLElement[];
  side: HTMLElement[];
  /** the content's width */
  width: number;
  /** the gaps between the content's parts, which no part can be given */
  gaps: number;
  parts?: Pick<FitInput, 'name' | 'title' | 'side'>;
  spread?: FitGroup;
  /** what was measured: the row is measured again only when this changes */
  signature?: string;
}

const rows = new Map<HTMLElement, RowState>();
const rowOfContent = new WeakMap<Element, HTMLElement>();
const waiting = new Set<HTMLElement>();
let observer: ResizeObserver | undefined;

// the width itself, not a custom property: one would be inherited, and so restyle the pill and
// its icons on every write
function setWidth(part: HTMLElement, width: number) {
  part.style.width = `${width}px`;
}

/** Sets every part's width for the row's room and spread: arithmetic and writes, nothing read. */
function apply(row: HTMLElement, state: RowState, animate: boolean) {
  if (!state.parts) return;
  const fit = fitRow({ ...state.parts, room: state.width - state.gaps, spread: state.spread });
  // only a spread animates: a resize must follow the pointer
  row.toggleAttribute('data-fit-spreading', animate);
  setWidth(state.name, fit.name);
  state.title.forEach((slot, index) => setWidth(slot, fit.title[index]));
  state.side.forEach((slot, index) => setWidth(slot, fit.side[index]));
}

function partOf(element: HTMLElement) {
  const natural = element.getBoundingClientRect().width;
  // a key or a subtask count on top of its group stays whole
  const kept = element.matches(':last-child:has(> [data-keep])');
  const style = getComputedStyle(element);
  const min = kept ? natural : parseFloat(style.minWidth) || 0;
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  return { natural, min: Math.min(min, natural), weight: natural - padding };
}

/** Measures every waiting row in one pass, so the page lays out once for all of them. */
function measureWaiting() {
  const batch = [...waiting].filter((row) => rows.has(row));
  waiting.clear();
  for (const row of batch) row.setAttribute('data-measuring', '');
  for (const row of batch) {
    const state = rows.get(row)!;
    const groups = [state.title, state.side].filter((group) => group.length > 0).length;
    state.width = state.content.getBoundingClientRect().width;
    state.gaps = groups * (parseFloat(getComputedStyle(state.content).columnGap) || 0);
    state.parts = {
      name: partOf(state.name),
      title: state.title.map(partOf),
      side: state.side.map(partOf),
    };
  }
  for (const row of batch) {
    row.removeAttribute('data-measuring');
    apply(row, rows.get(row)!, false);
  }
}

/** Measures the row again if what it shows has changed. */
function refresh(row: HTMLElement) {
  const state = rows.get(row);
  if (!state) return;
  state.title = Array.from(row.querySelectorAll<HTMLElement>('[data-title] [data-pills] > *'));
  state.side = Array.from(row.querySelectorAll<HTMLElement>('[data-side] [data-pills] > *'));
  const signature = `${state.title.length}:${state.side.length}:${state.content.textContent}`;
  if (signature === state.signature) return;
  state.signature = signature;
  // a microtask runs before the paint, after every row of this commit has asked
  if (waiting.size === 0) queueMicrotask(measureWaiting);
  waiting.add(row);
}

function attach(row: HTMLElement) {
  const name = row.querySelector<HTMLElement>('[data-name]');
  const content = name?.closest('[data-title]')?.parentElement;
  if (!name || !content) return;
  const state: RowState = { content, name, title: [], side: [], width: 0, gaps: 0 };
  rows.set(row, state);
  rowOfContent.set(content, row);

  if (!observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const resized = rowOfContent.get(entry.target);
        const resizedState = resized && rows.get(resized);
        // the first report after a row is measured is the width it was measured at
        if (!resized || !resizedState) continue;
        if (Math.abs(resizedState.width - entry.contentRect.width) < 0.05) continue;
        resizedState.width = entry.contentRect.width;
        apply(resized, resizedState, false);
      }
    });
    // text is as wide as its font: measure every row again once one has loaded
    document.fonts.addEventListener('loadingdone', () => {
      for (const [live, liveState] of rows) {
        liveState.signature = undefined;
        refresh(live);
      }
    });
  }
  observer.observe(content);

  const sync = () => {
    const group = row.querySelector(SPREAD_GROUP);
    const next = group ? (group.closest('[data-side]') ? 'side' : 'title') : undefined;
    if (next === state.spread) return;
    state.spread = next;
    apply(row, state, true);
  };
  const events = ['pointerover', 'pointerout', 'focusin', 'focusout'] as const;
  for (const event of events) row.addEventListener(event, sync);
  // a hover card closing (the pointer was on the card, outside the row) is no event on the row
  const cards = new MutationObserver(sync);
  cards.observe(row, { subtree: true, attributeFilter: ['data-popup-open'] });

  return () => {
    for (const event of events) row.removeEventListener(event, sync);
    cards.disconnect();
    observer?.unobserve(content);
    rows.delete(row);
    waiting.delete(row);
  };
}

/** Fits a row marked `data-fit`, or inside something that is, by measuring it; no other row. */
export function useMeasuredFit(rowRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const row = rowRef.current;
    // on the row itself, or around a list of them (TaskList passes its rows no attribute)
    if (!row?.closest('[data-fit]')) return;
    row.setAttribute('data-fit', '');
    return attach(row);
  }, [rowRef]);
  // after every render: what the row shows may have changed (a check of its text, nothing measured)
  useLayoutEffect(() => {
    if (rowRef.current) refresh(rowRef.current);
  });
}
