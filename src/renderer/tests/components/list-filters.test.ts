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

// A list's filters in its toolbar: a chip for each one that is set, with its own ×, then
// "+ Filter"; in a compact window the chips fold into one "Filter" button with a count.

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
    // each chip is its value and its ×; the menu's button names no filter
    expect(buttons()).toEqual(['PriorityAlpha', '', 'SourceBeta', '', 'Filter']);
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
    expect(buttons()).toEqual(['Filter2']);
  });
});
