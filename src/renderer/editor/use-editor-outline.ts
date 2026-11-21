import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';

export interface OutlineHeading {
  id: string;
  label: string;
  // closed up from the heading's own level: a note that starts at `##` starts at 1
  level: number;
}

// how far under the scroller's top a heading counts as being read, and where choosing one puts it
const READING_LINE = 96;
const SCROLL_MARGIN = 48;
const NO_HEADINGS: OutlineHeading[] = [];

/**
 * The editor's headings for a table of contents (`HeadingAnchors` keeps them), the one being read
 * as its nearest scrolling ancestor (the page's scroller) moves, and `scrollTo`, which scrolls a
 * heading to the top. The one being read is the last heading above a line 96px under the
 * scroller's top; scrolled to the end, the last one on screen, so a short last section can be
 * reached. A heading just chosen stays marked until the user scrolls again.
 */
export function useEditorOutline(editor: Editor | null) {
  const headings =
    useEditorState({
      editor,
      selector: ({ editor }) => {
        const anchors = editor?.storage.tableOfContents?.content ?? [];
        // TipTap puts a first `##` at level 2: close the levels up to start at 1
        const top = Math.min(...anchors.map((anchor) => anchor.level));
        return anchors.map(
          (anchor): OutlineHeading => ({
            id: anchor.id,
            label: anchor.textContent,
            level: anchor.level - top + 1,
          }),
        );
      },
      equalityFn: sameHeadings,
    }) ?? NO_HEADINGS;
  const [activeId, setActiveId] = useState<string | null>(null);
  // the heading just chosen, kept marked while its smooth scroll runs and after, if it can't reach
  // the reading line
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    if (!editor || headings.length === 0) return;
    const scroller = scrollParentOf(editor.view.dom);
    const target: HTMLElement | Window = scroller === document.scrollingElement ? window : scroller;
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const box =
        scroller === document.scrollingElement
          ? { top: 0, bottom: window.innerHeight }
          : scroller.getBoundingClientRect();
      const tops = headings.map((heading) => ({
        id: heading.id,
        top: headingElement(editor, heading.id)?.getBoundingClientRect().top,
      }));
      let active: string | null = null;
      for (const { id, top } of tops) {
        if (top === undefined) continue;
        if (top > box.top + READING_LINE) break;
        active = id;
      }
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      if (atEnd) {
        const onScreen = tops.filter(({ top }) => top !== undefined && top < box.bottom);
        const chosenOnScreen = onScreen.find(({ id }) => id === chosen.current);
        active = chosenOnScreen?.id ?? onScreen.at(-1)?.id ?? active;
      } else if (chosen.current && tops.some(({ id }) => id === chosen.current)) {
        active = chosen.current;
      }
      setActiveId(active);
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(measure);
    };
    // the user scrolling (not the scroll a choice started) lets go of the heading chosen
    const release = () => {
      chosen.current = null;
    };

    measure();
    target.addEventListener('scroll', schedule, { passive: true });
    scroller.addEventListener('wheel', release, { passive: true });
    scroller.addEventListener('touchmove', release, { passive: true });
    scroller.addEventListener('keydown', release);
    const resize = new ResizeObserver(schedule);
    resize.observe(editor.view.dom);
    resize.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', schedule);
      scroller.removeEventListener('wheel', release);
      scroller.removeEventListener('touchmove', release);
      scroller.removeEventListener('keydown', release);
      resize.disconnect();
    };
  }, [editor, headings]);

  const scrollTo = useCallback(
    (id: string) => {
      if (!editor || editor.isDestroyed) return;
      const element = headingElement(editor, id);
      if (!element) return;
      const scroller = scrollParentOf(editor.view.dom);
      const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      chosen.current = id;
      setActiveId(id);
      scroller.scrollTo({
        top: scroller.scrollTop + element.getBoundingClientRect().top - top - SCROLL_MARGIN,
        behavior: reduced ? 'auto' : 'smooth',
      });
    },
    [editor],
  );

  // a heading chosen and then deleted is no longer marked
  const shownActive = headings.some((heading) => heading.id === activeId) ? activeId : null;
  return { headings, activeId: shownActive, scrollTo };
}

function sameHeadings(a: OutlineHeading[] | null, b: OutlineHeading[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (heading, i) =>
      heading.id === b[i].id && heading.label === b[i].label && heading.level === b[i].level,
  );
}

function headingElement(editor: Editor, id: string): HTMLElement | null {
  return editor.view.dom.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(id)}"]`);
}

// the nearest ancestor that scrolls up and down, or the document's
function scrollParentOf(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent !== document.body) return parent;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}
