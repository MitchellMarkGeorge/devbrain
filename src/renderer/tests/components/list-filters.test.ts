import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Circle } from 'lucide-react';
import {
  ListFilters,
  type ListFilterField,
  type ListFiltersProps,
} from '../../components/lists/ListToolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A list's filters in its toolbar: a chip for each of the first ones that are set, with its own ×,
// then "+ Filter". A window draws as many chips as its size allows (two when wide, one when medium,
// none when compact); the rest fold into the button's count.

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
  it('draws a chip for each filter that is set, then "+ Filter" and Clear', () => {
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

  const three = () => [field('Priority', 'a'), field('Due', 'b'), field('Source', 'a')];
  const labels = () => chips().map((chip) => chip.getAttribute('aria-label'));

  it('draws two chips in a wide window, the rest folded into "Filter +N"', () => {
    render({ fields: three(), size: 'wide' });
    expect(labels()).toEqual(['Priority filter', 'Due filter']);
    expect(buttons().slice(-2)).toEqual(['Filter+1', 'Clear']);
  });

  it('is a wide window’s toolbar when no size is given', () => {
    render({ fields: three() });
    expect(labels()).toEqual(['Priority filter', 'Due filter']);
  });

  it('draws one chip in a medium window', () => {
    render({ fields: three(), size: 'medium' });
    expect(labels()).toEqual(['Priority filter']);
    expect(buttons().slice(-2)).toEqual(['Filter+2', 'Clear']);
  });

  it('folds every chip in a compact window, the button counting the filters', () => {
    render({ fields: three(), size: 'compact' });
    expect(chips()).toEqual([]);
    expect(buttons()).toEqual(['Filter3', 'Clear']);
  });

  it('shows the first chips in the fields’ order, and the next one when one is removed', () => {
    const fields = three();
    render({ fields, size: 'medium' });
    expect(labels()).toEqual(['Priority filter']);
    render({ fields: [field('Priority'), ...fields.slice(1)], size: 'medium' });
    expect(labels()).toEqual(['Due filter']);
    expect(buttons().slice(-2)).toEqual(['Filter+1', 'Clear']);
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
    render({ fields: [field('Priority', 'a'), field('Due')], size: 'compact' });
    expect(buttons()).toEqual(['Filter1', 'Clear']);
  });
});
