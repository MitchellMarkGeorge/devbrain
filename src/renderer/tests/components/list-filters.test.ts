import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Circle } from 'lucide-react';
import { chipsThatFit, filterSummary } from '../../components/lists/ListToolbar/ListToolbar';
import { TooltipProvider } from '../../components/ui/Tooltip';
import {
  ListFilterButton,
  ListFilters,
  type ListFilterField,
  type ListMultiFilterField,
  type ListFiltersProps,
} from '../../components/lists/ListToolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A list's filters in its toolbar: a chip for each one that is set, at the start, with a marker for
// those that don't fit and Clear at the row's end; and the Filter button, at the end beside
// Display, whose menu adds and changes them. (jsdom lays nothing out, so here every chip fits.)

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

// the toolbar's two pieces over the same fields, as a page draws them
const render = (props: Partial<ListFiltersProps> & Pick<ListFiltersProps, 'fields'>) =>
  act(() =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(
          Fragment,
          null,
          createElement(ListFilters, { onClear: () => {}, ...props }),
          createElement(ListFilterButton, { onClear: () => {}, ...props }),
        ),
      ),
    ),
  );
const button = () => container.querySelector<HTMLElement>('button[aria-label="Filter"]');
const chips = () => [...container.querySelectorAll('[data-chip]')];
const clear = () => container.querySelector<HTMLElement>('[aria-label="Clear filters"]');

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
/** Opens the Filter menu, then the submenu of the field whose item starts with `label`. */
const openField = (label: string) => {
  press(button());
  press(items('menuitem').find((element) => element.textContent?.startsWith(label)) ?? null);
};

describe('ListFilters', () => {
  it('draws nothing while no filter is set', () => {
    render({ fields: [field('Priority'), field('Due')] });
    expect(chips()).toEqual([]);
    expect(clear()).toBeNull();
    // the Filter button is the toolbar's only control for them
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('draws a chip for each filter that is set, in the fields’ order, then Clear', () => {
    render({
      fields: [multi('Priority', ['a', 'b']), field('Due'), multi('Link', ['c', 'b', 'a'])],
    });
    expect(chips().map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Priority filter',
      'Link filter',
    ]);
    // each chip's value and its ×, Clear, then the Filter button at the toolbar's end
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'PriorityAlpha, Beta',
      '',
      'LinkAlpha +2',
      '',
      'Clear',
      '',
    ]);
    expect([...container.querySelectorAll('button')].at(-1)).toBe(button());
  });

  it('removes a filter from its chip’s ×', () => {
    const priority = multi('Priority', ['a', 'b']);
    const due = field('Due', 'a');
    render({ fields: [priority, due] });
    act(() =>
      container.querySelector<HTMLElement>('[aria-label="Remove Priority filter"]')!.click(),
    );
    expect(priority.onChange).toHaveBeenCalledWith([]);
    act(() => container.querySelector<HTMLElement>('[aria-label="Remove Due filter"]')!.click());
    expect(due.onChange).toHaveBeenCalledWith(undefined);
  });

  it('opens a field’s values from its chip, with no "Any": the × removes the filter', () => {
    const priority = multi('Priority', ['c', 'a']);
    render({ fields: [priority, field('Due', 'a')] });
    press(chips()[0]!.querySelector('button'));
    expect(items('menuitemcheckbox').map((element) => element.textContent)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    press(item('menuitemcheckbox', 'Beta'));
    expect(priority.onChange).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    // ticking leaves the chip's menu open
    expect(items('menuitemcheckbox')).toHaveLength(3);
  });

  it('offers Clear while any filter is set, and it removes them all', () => {
    const onClear = vi.fn();
    render({ fields: [field('Priority', 'a'), field('Due')], onClear });
    act(() => clear()!.click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('ListFilterButton', () => {
  it('is one icon button, the same whatever is set', () => {
    render({ fields: [field('Priority'), field('Due')] });
    expect(button()!.textContent).toBe('');
    render({ fields: [multi('Priority', ['a', 'b']), field('Due', 'a')] });
    expect(button()!.textContent).toBe('');
    expect(button()!.getAttribute('aria-label')).toBe('Filter');
  });

  it('lists every field in its menu, each with what it is filtered to', () => {
    render({
      fields: [multi('Priority', ['a', 'b']), field('Due'), multi('Link', ['a', 'b', 'c'])],
    });
    press(button());
    expect(items('menuitem').map((element) => element.textContent)).toEqual([
      'PriorityAlpha, Beta',
      'Due',
      'LinkAlpha +2',
      'Clear filters',
    ]);
  });

  it('offers "Clear filters" only while a filter is set', () => {
    render({ fields: [field('Priority'), field('Due')] });
    press(button());
    expect(items('menuitem').map((element) => element.textContent)).toEqual(['Priority', 'Due']);
  });
});

describe('a filter that holds several values', () => {
  it('names one value, two side by side, and from three the first and how many more', () => {
    expect(filterSummary(multi('Priority', ['a']))).toEqual({ text: 'Alpha', more: 0 });
    // in the options' order, whatever order they were ticked in
    expect(filterSummary(multi('Priority', ['b', 'a']))).toEqual({ text: 'Alpha, Beta', more: 0 });
    expect(filterSummary(multi('Priority', ['c', 'b', 'a']))).toEqual({ text: 'Alpha', more: 2 });
  });

  it('ticks its values on their own in its submenu, in the options’ order', () => {
    const priority = multi('Priority', ['c', 'a']);
    render({ fields: [priority] });
    openField('Priority');
    // checkbox items, "Any" first
    expect(items('menuitemcheckbox').map((element) => element.textContent)).toEqual([
      'Any',
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(
      items('menuitemcheckbox').map((element) => element.getAttribute('aria-checked')),
    ).toEqual(['false', 'true', 'false', 'true']);
    press(item('menuitemcheckbox', 'Beta'));
    expect(priority.onChange).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    press(item('menuitemcheckbox', 'Gamma'));
    expect(priority.onChange).toHaveBeenLastCalledWith(['a']);
    // ticking leaves the menu open
    expect(items('menuitemcheckbox')).toHaveLength(4);
  });

  it('removes the filter with Any, or by unticking its last value', () => {
    const priority = multi('Priority', ['a']);
    render({ fields: [priority] });
    openField('Priority');
    press(item('menuitemcheckbox', 'Alpha'));
    expect(priority.onChange).toHaveBeenLastCalledWith([]);
    press(item('menuitemcheckbox', 'Any'));
    expect(priority.onChange).toHaveBeenCalledTimes(2);
    expect(priority.onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('a filter that holds one value', () => {
  it('is a choice of one, and picking leaves the menu open', () => {
    const due = field('Due', 'a');
    render({ fields: [due] });
    openField('Due');
    expect(items('menuitemcheckbox')).toEqual([]);
    press(item('menuitemradio', 'Beta'));
    expect(due.onChange).toHaveBeenCalledWith('b');
    expect(items('menuitemradio')).toHaveLength(4);
    press(item('menuitemradio', 'Any'));
    expect(due.onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('chipsThatFit', () => {
  // three chips of 150px (gap included); the "+N" marker keeps 52px
  const widths = [150, 150, 150];

  it('shows every chip while they fit', () => {
    expect(chipsThatFit(widths, 450)).toBe(3);
    expect(chipsThatFit([], 0)).toBe(0);
  });

  it('hides from the end, leaving room for the marker', () => {
    // one pixel short of all three: the third hides, and the marker needs its room
    expect(chipsThatFit(widths, 449)).toBe(2);
    expect(chipsThatFit(widths, 352)).toBe(2);
    expect(chipsThatFit(widths, 351)).toBe(1);
  });

  it('hides them all when not one fits', () => {
    expect(chipsThatFit(widths, 200)).toBe(0);
  });

  it('stops at the first chip that does not fit, so the chips shown stay in order', () => {
    expect(chipsThatFit([300, 100], 250)).toBe(0);
  });
});
