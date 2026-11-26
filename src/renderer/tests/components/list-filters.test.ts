import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Circle } from 'lucide-react';
import { chipsThatFit } from '../../components/lists/ListToolbar/ListToolbar';
import {
  ListFilters,
  type ListFilterField,
  type ListFiltersProps,
} from '../../components/lists/ListToolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A list's filters in its toolbar: a chip for each one that is set, with its own ×, then
// "+ Filter"; the chips that don't fit the row fold into the button's count, and in a compact
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

const field = (id: string, value?: string): ListFilterField => ({
  id,
  label: id,
  icon: Circle,
  options: [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ],
  value,
  onChange: vi.fn(),
});

const render = (props: Partial<ListFiltersProps> & Pick<ListFiltersProps, 'fields'>) =>
  act(() => root.render(createElement(ListFilters, { onClear: () => {}, ...props })));
const chips = () => [...container.querySelectorAll('[role="group"]')];
const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent);

describe('ListFilters', () => {
  it('draws a chip for each filter that is set, then "+ Filter"', () => {
    render({ fields: [field('Priority', 'a'), field('Due'), field('Source', 'b')] });
    expect(chips().map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Priority filter',
      'Source filter',
    ]);
    // each chip is its value and its ×; the menu's button names no filter; then Clear
    expect(buttons()).toEqual(['PriorityAlpha', '', 'SourceBeta', '', 'Filter', 'Clear']);
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
    expect(buttons()).toEqual(['Filter']);
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

describe('chipsThatFit', () => {
  // three chips of 150px (gap included), "+ Filter" 84px wide; "Filter +N" keeps 112px
  const chips = [150, 150, 150];

  it('shows every chip while they fit with "+ Filter" after them', () => {
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
