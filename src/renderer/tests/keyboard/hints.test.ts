// @vitest-environment happy-dom
import { act, createElement, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectHints,
  hintLabels,
  HintRegistry,
  KeyboardProvider,
  useHintTarget,
  useKeyboardState,
  vimKeymap,
  type KeyboardState,
} from '../../keyboard';
import { press } from './helpers';

// Vim's `f` hints: the labels, which elements get one, registering with useHintTarget, and the
// overlay picking a target by its label.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('hint labels', () => {
  it('are single letters while the home row has enough, then two', () => {
    expect(hintLabels(3)).toEqual(['a', 's', 'd']);
    const two = hintLabels(12);
    expect(two.slice(0, 4)).toEqual(['aa', 'as', 'ad', 'af']);
    expect(two[9]).toBe('sa');
    expect(new Set(two).size).toBe(12);
    expect(hintLabels(100)[0]).toBe('aaa');
    expect(hintLabels(0)).toEqual([]);
  });

  it('never makes one label the start of another', () => {
    const labels = hintLabels(40);
    for (const a of labels) {
      for (const b of labels) if (a !== b) expect(b.startsWith(a)).toBe(false);
    }
  });
});

describe('collecting targets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function html(markup: string) {
    document.body.innerHTML = markup;
  }

  it('finds buttons, links, fields and focusable leaves, in document order', () => {
    html(`
      <nav><a href="#home" id="home">Home</a><button id="new">New</button></nav>
      <input id="field" />
      <div tabindex="0" id="event">Stand-up</div>
      <div tabindex="0" role="grid" id="grid"><button id="inner">x</button></div>
      <button disabled id="off">Off</button>
      <div hidden><button id="hidden">x</button></div>
    `);
    const ids = collectHints(document, new HintRegistry()).map((t) => t.element.id);
    expect(ids).toEqual(['home', 'new', 'field', 'event', 'inner']);
  });

  it('labels a registered row once, with its action, and not the controls in it', () => {
    html(
      `<div id="row"><button id="status">s</button><span>Task</span></div><button id="after">a</button>`,
    );
    const registry = new HintRegistry();
    const open = vi.fn();
    registry.register(document.getElementById('row')!, open);
    const targets = collectHints(document, registry);
    expect(targets.map((t) => t.element.id)).toEqual(['row', 'after']);
    targets[0].activate();
    expect(open).toHaveBeenCalled();
  });

  it('keeps to the top-most dialog while one is open', () => {
    html(`
      <button id="page">Page</button>
      <div role="dialog"><div data-key-scope="dialog" data-key-modal><button id="ok">OK</button></div></div>
    `);
    expect(collectHints(document, new HintRegistry()).map((t) => t.element.id)).toEqual(['ok']);
  });

  it('clicks a button and focuses a field', () => {
    html(`<button id="b">B</button><input id="i" />`);
    const clicked = vi.fn();
    document.getElementById('b')!.addEventListener('click', clicked);
    const [button, field] = collectHints(document, new HintRegistry());
    button.activate();
    expect(clicked).toHaveBeenCalled();
    field.activate();
    expect(document.activeElement?.id).toBe('i');
  });
});

describe('the hint overlay', () => {
  let root: Root;
  let container: HTMLElement;
  let state: KeyboardState | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
  });

  function Spy() {
    state = useKeyboardState();
    return null;
  }

  function Row({ onOpen }: { onOpen: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useHintTarget(ref, onOpen);
    return createElement('div', { ref, id: 'row' }, 'A row');
  }

  function render(children: ReactNode) {
    act(() =>
      root.render(
        createElement(
          KeyboardProvider,
          { keymap: vimKeymap, platform: 'macos' },
          children,
          createElement(Spy),
        ),
      ),
    );
  }

  const labels = () =>
    [...document.querySelectorAll('[data-testid="hints"] > span')].map((el) => el.textContent);

  it('labels the targets on f, and runs the one whose label is typed', async () => {
    const open = vi.fn();
    const clicked = vi.fn();
    render([
      createElement(Row, { key: 'row', onOpen: open }),
      createElement('button', { key: 'b', id: 'b', onClick: clicked }, 'B'),
    ]);
    act(() => void press(document.body, 'f'));
    expect(state?.mode).toBe('hint');
    expect(labels()).toEqual(['A', 'S']);
    act(() => void press(document.body, 's'));
    await act(async () => {});
    expect(clicked).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(state?.mode).toBe('normal');
    expect(labels()).toEqual([]);
  });

  it('ignores a key no label goes on with, and Esc cancels', () => {
    render(createElement('button', { id: 'b' }, 'B'));
    act(() => void press(document.body, 'f'));
    act(() => void press(document.body, 'z'));
    expect(state?.mode).toBe('hint');
    act(() => void press(document.body, 'Escape'));
    expect(state?.mode).toBe('normal');
  });

  it('goes back to Normal when there is nothing to label', () => {
    render(null);
    act(() => void press(document.body, 'f'));
    expect(state?.mode).toBe('normal');
  });
});
