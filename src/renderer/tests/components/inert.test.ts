// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Inert } from '@renderer/components/layout/Inert';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Inert marks its content inert while `when` is true, on a `display: contents` div of its own or
// on the element given as `render`.

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

const draw = (props: Parameters<typeof Inert>[0] & Record<`data-${string}`, string>) =>
  act(() => root.render(createElement(Inert, props, 'Content')));

describe('Inert', () => {
  it('draws a display: contents div, inert while `when` is true', () => {
    draw({ when: true });
    const element = container.firstElementChild as HTMLElement;
    expect(element.tagName).toBe('DIV');
    expect(element.style.display).toBe('contents');
    expect(element.getAttribute('inert')).toBe('');
    draw({ when: false });
    expect(element.hasAttribute('inert')).toBe(false);
  });

  it('is inert by default', () => {
    draw({});
    expect(container.firstElementChild!.hasAttribute('inert')).toBe(true);
  });

  it('marks the element given as `render`, keeping its layout, and forwards its ref', () => {
    const ref = createRef<HTMLDivElement>();
    draw({ ref, render: createElement('section', { className: 'column' }), 'data-trashed': '' });
    const element = container.firstElementChild as HTMLElement;
    expect(element.tagName).toBe('SECTION');
    expect(element.className).toBe('column');
    expect(element.style.display).toBe('');
    expect(element.hasAttribute('inert')).toBe(true);
    expect(element.hasAttribute('data-trashed')).toBe(true);
    expect(ref.current).toBe(element);
  });
});
