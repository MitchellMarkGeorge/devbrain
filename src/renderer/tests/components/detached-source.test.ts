import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LinkState } from '@common/types';
import { EntityHoverCardContent } from '@renderer/components/entities/EntityHoverCard';
import { TaskRow } from '@renderer/components/lists/TaskRow';
import { sampleLinear, sampleTask } from '@renderer/components/lists/TaskRow/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A detached task keeps its source pill, drawn apart from a synced one's: the mark faded and an
// unlink glyph, "detached" in its name, and a hover card that no longer speaks for Linear.

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

const synced = sampleLinear('ENG-1');
const detached = { ...sampleLinear('ENG-2'), state: LinkState.DETACHED };
const pill = () => container.querySelector<HTMLElement>('[data-slot="badge"]');

describe('a task row’s source pill', () => {
  const render = (external: typeof synced) =>
    act(() =>
      root.render(createElement(TaskRow, { task: sampleTask({ title: 'A task', external }) })),
    );

  it('marks a detached copy, in its look and its name', () => {
    render(detached);
    expect(pill()!.hasAttribute('data-detached')).toBe(true);
    expect(pill()!.getAttribute('aria-label')).toBe('ENG-2, detached');
    expect(pill()!.getAttribute('title')).toBe('ENG-2 · Detached');
  });

  it('leaves a synced one as it was', () => {
    render(synced);
    expect(pill()!.hasAttribute('data-detached')).toBe(false);
    expect(pill()!.getAttribute('aria-label')).toBeNull();
    expect(pill()!.getAttribute('title')).toBe('ENG-1');
  });
});

describe('a source’s hover card', () => {
  const render = (external: typeof synced) =>
    act(() =>
      root.render(
        createElement(EntityHoverCardContent, {
          entity: {
            type: 'source',
            title: 'A task',
            external: { ...external, statusLabel: 'In Review' },
          },
        }),
      ),
    );

  it('says a detached copy no longer follows Linear', () => {
    render(detached);
    expect(container.textContent).toContain('Detached from Linear');
    expect(container.textContent).toContain('Edits stay in DevBrain');
    expect(container.textContent).not.toContain('In Review in Linear');
    expect(container.textContent).not.toContain('Synced');
  });

  it('gives a synced one its state in Linear and the last sync', () => {
    render(synced);
    expect(container.textContent).toContain('In Review in Linear');
    expect(container.textContent).toContain('Synced');
  });
});
