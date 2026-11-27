import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoardCard } from '@renderer/components/board/BoardCard';
import { NoteRow } from '@renderer/components/lists/NoteRow';
import { TaskRow } from '@renderer/components/lists/TaskRow';
import { NoteCard } from '@renderer/components/notes/NoteCard';
import {
  sampleNoteLink,
  sampleParent,
  sampleProject,
  sampleTask,
} from '@renderer/components/lists/TaskRow/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A click on a row's or card's relation pill opens what the pill points at (`onOpenEntity`, with
// the pill's summary), never the row's own item: the row skips clicks from its controls, so the
// pills need no `stopPropagation`.

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

const render = (element: ReactElement) => act(() => root.render(element));
const click = (selector: string) => {
  const el = container.querySelector<HTMLElement>(selector);
  expect(el).not.toBeNull();
  act(() => el!.click());
};

const project = sampleProject('Website');
const parent = sampleParent('Launch');
const link = sampleNoteLink('Spec');
const task = sampleTask({ title: 'A task', project, parentTask: parent, link });
const note = { title: 'A note', preview: null, updatedAt: new Date(), project, link: null };

describe('TaskRow', () => {
  it.each([
    ['parent', parent],
    ['note', link],
    ['project', project],
  ] as const)('opens its %s pill, not the task', (type, entity) => {
    const onOpen = vi.fn();
    const onOpenEntity = vi.fn();
    render(createElement(TaskRow, { task, onOpen, onOpenEntity }));
    click(`[data-entity="${type}"]`);
    expect(onOpenEntity).toHaveBeenCalledWith(expect.objectContaining({ id: entity.id }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the task on a click elsewhere on the row', () => {
    const onOpen = vi.fn();
    const onOpenEntity = vi.fn();
    render(createElement(TaskRow, { task, onOpen, onOpenEntity }));
    click('[data-name]');
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpenEntity).not.toHaveBeenCalled();
  });

  it('opens nothing on a pill without onOpenEntity', () => {
    const onOpen = vi.fn();
    render(createElement(TaskRow, { task, onOpen }));
    click('[data-entity="project"]');
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('BoardCard', () => {
  it('opens its project pill, not the task', () => {
    const onClick = vi.fn();
    const onOpenEntity = vi.fn();
    render(createElement(BoardCard, { task, onClick, onOpenEntity }));
    click('[data-entity="project"]');
    expect(onOpenEntity).toHaveBeenCalledWith(expect.objectContaining({ id: project.id }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('NoteRow', () => {
  it('opens its project pill, not the note', () => {
    const onOpen = vi.fn();
    const onOpenEntity = vi.fn();
    render(createElement(NoteRow, { note, onOpen, onOpenEntity }));
    click('[data-entity="project"]');
    expect(onOpenEntity).toHaveBeenCalledWith(expect.objectContaining({ id: project.id }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('NoteCard', () => {
  it('opens its pill, not the note', () => {
    const onOpen = vi.fn();
    const onOpenEntity = vi.fn();
    render(createElement(NoteCard, { note, onOpen, onOpenEntity }));
    click('[data-entity="project"]');
    expect(onOpenEntity).toHaveBeenCalledWith(expect.objectContaining({ id: project.id }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the note on a click elsewhere, and on Enter on the card but not on its pill', () => {
    const onOpen = vi.fn();
    render(createElement(NoteCard, { note, onOpen, onOpenEntity: () => {} }));
    const card = container.firstElementChild as HTMLElement;
    act(() => card.click());
    expect(onOpen).toHaveBeenCalledOnce();
    const enter = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    act(() => {
      container.querySelector('[data-entity="project"]')!.dispatchEvent(enter());
    });
    expect(onOpen).toHaveBeenCalledOnce();
    act(() => {
      card.dispatchEvent(enter());
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
