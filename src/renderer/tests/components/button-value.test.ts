// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button, type ButtonProps } from '../../components/ui/Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A toolbar button's value ("Filter Today"): in a compact window it hides, and a filter that is on
// (`active`) draws the button pressed instead, so the toolbar still shows it.

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

const render = (props: ButtonProps) =>
  act(() => root.render(createElement(Button, props, 'Filter')));
const button = () => container.querySelector('button')!;

describe('Button with a value', () => {
  it('shows the value, and is not pressed, while it shows', () => {
    render({ value: 'Today', active: true });
    expect(button().textContent).toBe('FilterToday');
    expect(button().hasAttribute('data-pressed')).toBe(false);
  });

  it('draws pressed when the value hides and the filter is on', () => {
    render({ value: 'Today', hideValue: true, active: true });
    expect(button().hasAttribute('data-pressed')).toBe(true);
    // still read out
    expect(button().textContent).toBe('FilterToday');
  });

  it('is not pressed when the value hides at its default', () => {
    render({ value: 'All', hideValue: true });
    expect(button().hasAttribute('data-pressed')).toBe(false);
  });
});
