// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMap, type MapState } from '@renderer/shared/hooks/use-map';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useMap', () => {
  let container: HTMLDivElement;
  let root: Root;
  // what the hook returned at each render
  let renders: MapState<string, number>[];

  beforeEach(() => {
    container = document.createElement('div');
    root = createRoot(container);
    renders = [];
    function Probe() {
      renders.push(useMap<string, number>([['a', 1]]));
      return null;
    }
    act(() => root.render(createElement(Probe)));
  });

  afterEach(() => act(() => root.unmount()));

  const latest = () => renders.at(-1)!;
  const entries = () => [...latest().map];

  it('starts with the entries given, and sets, removes and clears', () => {
    expect(entries()).toEqual([['a', 1]]);
    act(() => latest().set('b', 2));
    expect(entries()).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    act(() => latest().remove('a'));
    expect(entries()).toEqual([['b', 2]]);
    act(() => latest().clear());
    expect(entries()).toEqual([]);
  });

  it('retains only the entries kept', () => {
    act(() => {
      latest().set('b', 2);
      latest().set('c', 3);
    });
    act(() => latest().retain((key, value) => key === 'a' || value === 3));
    expect(entries()).toEqual([
      ['a', 1],
      ['c', 3],
    ]);
  });

  it('gives a new map on a change, and keeps the same one when nothing changes', () => {
    const first = latest().map;
    act(() => latest().set('a', 2));
    expect(latest().map).not.toBe(first);

    const second = latest().map;
    act(() => {
      latest().set('a', 2);
      latest().remove('missing');
      latest().retain(() => true);
    });
    expect(latest().map).toBe(second);
  });

  it('keeps its functions the same between renders', () => {
    const { set, remove, clear, retain } = latest();
    act(() => latest().set('b', 2));
    expect(latest()).toMatchObject({ set, remove, clear, retain });
  });
});
