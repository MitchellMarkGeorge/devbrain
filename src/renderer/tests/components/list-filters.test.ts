import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Circle } from 'lucide-react';
import { chipsThatFit, filterSummary } from '../../components/lists/ListToolbar/ListToolbar';
import {
  ListFilters,
  type ListFilterField,
  type ListMultiFilterField,
  type ListFiltersProps,
} from '../../components/lists/ListToolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A list's filters in its toolbar: a chip for each one that is set, with its own ×, then
// the Filter button (an icon button, so it has no text); the chips that don't fit the row fold into the button's count, and in a compact
// window they all do. (jsdom lays nothing out, so here every chip fits.)

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

const field = (id: string, value?: string): ListFilterField => ({
  id,
  label: id,
  icon: Circle,
  options: OPTIONS,
  value,
  onChange: vi.fn(),
});

/** A field that holds several values. */
const multi = (id: string, value: string[] = []): ListMultiFilterField => ({
  id,
  label: id,
  icon: Circle,
  options: OPTIONS,
  multiple: true,
  value,
  onChange: vi.fn(),
});

const render = (props: Partial<ListFiltersProps> & Pick<ListFiltersProps, 'fields'>) =>
  act(() => root.render(createElement(ListFilters, { onClear: () => {}, ...props })));
const chips = () => [...container.querySelectorAll('[role="group"]')];
const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent);

describe('ListFilters', () => {
  it('draws a chip for each filter that is set, then the Filter button', () => {
    render({ fields: [field('Priority', 'a'), field('Due'), field('Source', 'b')] });
    expect(chips().map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Priority filter',
      'Source filter',
    ]);
    // each chip is its value and its ×; the menu's button names no filter; then Clear
    expect(buttons()).toEqual(['PriorityAlpha', '', 'SourceBeta', '', '', 'Clear']);
    expect(container.querySelector('button[aria-label="Filter"]')).not.toBeNull();
  });

  it('removes a filter from its chip’s ×', () => {
    const priority = field('Priority', 'a');
    render({ fields: [priority, field('Due', 'b')] });
    const remove = container.querySelector<HTMLElement>('[aria-label="Remove Priority filter"]')!;
    act(() => remove.click());
    expect(priority.onChange).toHaveBeenCalledWith(undefined);
  });

  it('draws no chip with nothing set', () => {
    render({ fields: [field('Priority'), field('Due')] });
    expect(chips()).toEqual([]);
    expect(buttons()).toEqual(['']);
  });

  it('folds the chips into the Filter button’s count in a compact window', () => {
    render({ fields: [field('Priority', 'a'), field('Due', 'b')], compact: true });
    expect(chips()).toEqual([]);
    expect(buttons()).toEqual(['Filter2', 'Clear']);
  });

  it('offers Clear at the row’s end while any filter is set, and it removes them all', () => {
    const onClear = vi.fn();
    const clear = () => container.querySelector<HTMLElement>('[aria-label="Clear filters"]');
    render({ fields: [field('Priority'), field('Due')], onClear });
    expect(clear()).toBeNull();
    // with one filter too, beside its chip's ×
    render({ fields: [field('Priority', 'a'), field('Due')], onClear });
    expect(clear()).not.toBeNull();
    render({ fields: [field('Priority', 'a'), field('Due', 'b')], onClear });
    // the last control of the row
    expect(clear()).toBe([...container.querySelectorAll('button')].at(-1));
    act(() => clear()!.click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('keeps Clear in a compact window with one filter, where its chip is folded', () => {
    render({ fields: [field('Priority', 'a'), field('Due')], compact: true });
    expect(buttons()).toEqual(['Filter1', 'Clear']);
  });
});

describe('a filter that holds several values', () => {
  const pointer = (target: Element | null, type: string) =>
    target?.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
  const press = (target: Element | null) =>
    act(() => {
      pointer(target, 'pointerdown');
      pointer(target, 'mousedown');
      pointer(target, 'pointerup');
      pointer(target, 'mouseup');
      pointer(target, 'click');
    });
  const items = (role: string) => [...document.body.querySelectorAll(`[role="${role}"]`)];
  const item = (role: string, label: string) =>
    items(role).find((element) => element.textContent === label) ?? null;

  it('names one value, two side by side, and from three the first and how many more', () => {
    expect(filterSummary(multi('Priority', ['a']))).toEqual({ text: 'Alpha', more: 0 });
    // in the options' order, whatever order they were ticked in
    expect(filterSummary(multi('Priority', ['b', 'a']))).toEqual({ text: 'Alpha, Beta', more: 0 });
    expect(filterSummary(multi('Priority', ['c', 'b', 'a']))).toEqual({ text: 'Alpha', more: 2 });
  });

  it('draws a chip while it has a value, with that summary', () => {
    render({
      fields: [multi('Priority', ['a', 'b']), multi('Project'), multi('Link', ['a', 'b', 'c'])],
    });
    expect(buttons()).toEqual(['PriorityAlpha, Beta', '', 'LinkAlpha +2', '', '', 'Clear']);
  });

  it('counts a field once in a compact window, however many values it has', () => {
    render({ fields: [multi('Priority', ['a', 'b']), field('Due', 'a')], compact: true });
    expect(buttons()).toEqual(['Filter2', 'Clear']);
  });

  it('removes every value from its chip’s ×', () => {
    const priority = multi('Priority', ['a', 'b']);
    render({ fields: [priority] });
    act(() =>
      container.querySelector<HTMLElement>('[aria-label="Remove Priority filter"]')!.click(),
    );
    expect(priority.onChange).toHaveBeenCalledWith([]);
  });

  it('ticks its values on their own in the chip’s menu, in the options’ order', () => {
    const priority = multi('Priority', ['c', 'a']);
    render({ fields: [priority] });
    press(container.querySelector('[role="group"] button'));
    // checkbox items, with no "Any": the chip's × removes the filter
    expect(items('menuitemcheckbox').map((element) => element.textContent)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(
      items('menuitemcheckbox').map((element) => element.getAttribute('aria-checked')),
    ).toEqual(['true', 'false', 'true']);
    press(item('menuitemcheckbox', 'Beta'));
    expect(priority.onChange).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    press(item('menuitemcheckbox', 'Gamma'));
    expect(priority.onChange).toHaveBeenLastCalledWith(['a']);
    // ticking leaves the menu open
    expect(items('menuitemcheckbox')).toHaveLength(3);
  });

  it('removes the filter when its last value is unticked', () => {
    const priority = multi('Priority', ['a']);
    render({ fields: [priority] });
    press(container.querySelector('[role="group"] button'));
    press(item('menuitemcheckbox', 'Alpha'));
    expect(priority.onChange).toHaveBeenLastCalledWith([]);
  });

  it('keeps a field that holds one value a choice of one', () => {
    const due = field('Due', 'a');
    render({ fields: [due] });
    press(container.querySelector('[role="group"] button'));
    expect(items('menuitemcheckbox')).toEqual([]);
    press(item('menuitemradio', 'Beta'));
    expect(due.onChange).toHaveBeenCalledWith('b');
    // picking leaves the menu open here too
    expect(items('menuitemradio')).toHaveLength(3);
  });
});

describe('chipsThatFit', () => {
  // three chips of 150px (gap included), a plain button 84px wide; "Filter +N" keeps 112px
  const chips = [150, 150, 150];

  it('shows every chip while they fit with the plain button after them', () => {
    expect(chipsThatFit(chips, 534, 84)).toBe(3);
  });

  it('folds from the end, leaving room for "Filter +N"', () => {
    // one pixel short of all three: the third folds, though it would fit without the button
    expect(chipsThatFit(chips, 533, 84)).toBe(2);
    expect(chipsThatFit(chips, 412, 84)).toBe(2);
    expect(chipsThatFit(chips, 411, 84)).toBe(1);
  });

  it('folds them all when not one fits', () => {
    expect(chipsThatFit(chips, 200, 84)).toBe(0);
  });

  it('stops at the first chip that does not fit, so the chips shown stay in order', () => {
    expect(chipsThatFit([300, 100], 250, 84)).toBe(0);
  });
});
