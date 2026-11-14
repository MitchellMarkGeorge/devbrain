// @vitest-environment happy-dom
import { createElement as h, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@renderer/components';
import { ModalProvider, useModals, type ModalProps, type Modals } from '@renderer/app/modals';

// The modal API (src/renderer/app/modals.tsx): dialogs shown from anywhere, drawn by the provider.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

function Named({ name, ...props }: ModalProps & { name: string }) {
  return h(
    Dialog,
    props,
    h(
      DialogContent,
      { 'data-testid': name } as object,
      h(DialogTitle, null, name),
      h('button', { onClick: () => props.onOpenChange(false) }, 'Done'),
    ),
  );
}

// the page's useModals, and the provider's `closed`, handed to the test as they render
interface Handles {
  modals?: Modals;
  setClosed?: (closed: boolean) => void;
}

function Page({ onModals }: { onModals: (modals: Modals) => void }) {
  const modals = useModals();
  useEffect(() => onModals(modals), [modals, onModals]);
  return h('p', null, 'page');
}

function App({ handles }: { handles: (next: Partial<Handles>) => void }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => handles({ setClosed }), [handles]);
  const onModals = useCallback((modals: Modals) => handles({ modals }), [handles]);
  return h(ModalProvider, { closed, children: h(Page, { onModals }) });
}

/** A provider with a page that hands out its `useModals`, and a switch for `closed`. */
function mount() {
  const handles: Handles = {};
  const update = (next: Partial<Handles>) => {
    Object.assign(handles, next);
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(h(App, { handles: update }));
  cleanups.push(() => {
    root.unmount();
    container.remove();
  });
  return {
    modals: () => handles.modals!,
    setClosed: (closed: boolean) => handles.setClosed!(closed),
    shown: () =>
      [...document.querySelectorAll('[data-testid^="modal-"]')].map((el) => el.textContent),
  };
}

const show = (modals: Modals, name: string) => modals.open((props) => h(Named, { ...props, name }));

describe('useModals', () => {
  it('shows a dialog over the page, and removes it when the function it returned closes it', async () => {
    const app = mount();
    await vi.waitFor(() => expect(app.modals()).toBeDefined());
    const close = show(app.modals(), 'modal-a');
    await vi.waitFor(() => expect(app.shown()).toEqual(['modal-aDone']));
    close();
    await vi.waitFor(() => expect(app.shown()).toEqual([]));
  });

  it('removes a dialog that closes itself', async () => {
    const app = mount();
    await vi.waitFor(() => expect(app.modals()).toBeDefined());
    show(app.modals(), 'modal-a');
    await vi.waitFor(() => expect(app.shown()).toHaveLength(1));
    document.querySelector<HTMLButtonElement>('[data-testid="modal-a"] button')!.click();
    await vi.waitFor(() => expect(app.shown()).toEqual([]));
  });

  it('draws several, the last opened last, and closes each on its own', async () => {
    const app = mount();
    await vi.waitFor(() => expect(app.modals()).toBeDefined());
    const closeA = show(app.modals(), 'modal-a');
    show(app.modals(), 'modal-b');
    await vi.waitFor(() => expect(app.shown()).toEqual(['modal-aDone', 'modal-bDone']));
    closeA();
    await vi.waitFor(() => expect(app.shown()).toEqual(['modal-bDone']));
  });

  it('drops them all while closed (a switch), and none comes back after', async () => {
    const app = mount();
    await vi.waitFor(() => expect(app.modals()).toBeDefined());
    show(app.modals(), 'modal-a');
    await vi.waitFor(() => expect(app.shown()).toHaveLength(1));
    app.setClosed(true);
    await vi.waitFor(() => expect(app.shown()).toEqual([]));
    app.setClosed(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(app.shown()).toEqual([]);
  });
});
