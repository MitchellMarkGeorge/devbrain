import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Circle } from 'lucide-react';
import { filterSummary } from '../../components/lists/ListToolbar/ListToolbar';
import { TooltipProvider } from '../../components/ui/Tooltip';
import {
  ListFilters,
  type ListFilterField,
  type ListMultiFilterField,
  type ListFiltersProps,
} from '../../components/lists/ListToolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A list's filters in its toolbar: one Filter icon button with a badge counting the filters that
// are set, and Clear at the row's end; the fields and their values are in the button's menu.

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
  act(() =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(ListFilters, { onClear: () => {}, ...props }),
      ),
    ),
  );
const button = () => container.querySelector<HTMLElement>('button[aria-label^="Filter"]');
const badge = () => container.querySelector('[data-filter-count]')?.textContent ?? null;
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
  it('is one icon button, with no badge and no Clear while nothing is set', () => {
    render({ fields: [field('Priority'), field('Due')] });
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(button()!.getAttribute('aria-label')).toBe('Filter');
    expect(badge()).toBeNull();
    expect(clear()).toBeNull();
  });

  it('counts the filters that are set in its badge, a field once however many values it has', () => {
    render({ fields: [multi('Priority', ['a', 'b', 'c']), field('Due'), field('Source', 'b')] });
    expect(badge()).toBe('2');
    // the count is in the button's name too: the badge itself is hidden from a screen reader
    expect(button()!.getAttribute('aria-label')).toBe('Filter, 2 set');
    // still one button for the filters, then Clear
    expect(container.querySelectorAll('button')).toHaveLength(2);
  });

  it('offers Clear at the row’s end while any filter is set, and it removes them all', () => {
    const onClear = vi.fn();
    render({ fields: [field('Priority', 'a'), field('Due')], onClear });
    expect(clear()).toBe([...container.querySelectorAll('button')].at(-1));
    act(() => clear()!.click());
    expect(onClear).toHaveBeenCalledTimes(1);
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
