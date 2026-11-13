import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HintLabel } from '../components';
import { collectHints, hintLabels, type HintTarget } from './hints';
import { useKeyboard, useKeyboardState } from './KeyboardProvider';
import styles from './HintOverlay.module.css';

/** The mode `f` puts the keyboard in. */
export const HINT_MODE = 'hint';

interface Placed {
  label: string;
  target: HintTarget;
  top: number;
  left: number;
}

// the label sits at the target's left edge, centred on its height (Figma `7703:57705`)
const LABEL_HEIGHT = 20;

function place(targets: HintTarget[]): Placed[] {
  const labels = hintLabels(targets.length);
  return targets.map((target, i) => {
    const rect = target.element.getBoundingClientRect();
    return {
      label: labels[i],
      target,
      top: Math.max(0, rect.top + (rect.height - LABEL_HEIGHT) / 2),
      left: Math.max(0, rect.left - 4),
    };
  });
}

/**
 * Vim's `f` hints: while the keyboard is in Hint mode, a `HintLabel` over every target on screen
 * (`collectHints`), and the keys typed pick one. Typing a whole label runs its target's action and
 * goes back to Normal; a key no label goes on with is ignored, Backspace takes one back, and Esc
 * (the keymap's), a scroll or a resize cancels. Rendered by `KeyboardProvider`; draws nothing in
 * any other mode.
 */
export function HintOverlay() {
  const { mode } = useKeyboardState();
  return mode === HINT_MODE ? <Hints /> : null;
}

function Hints() {
  const { dispatcher, hints } = useKeyboard();
  // the targets as the page stands when `f` was pressed, read once as hint mode starts
  const [placed] = useState(() => place(collectHints(document, hints)));
  const [typed, setTyped] = useState('');
  // the keys typed, read by the key handler as they come (the state draws them)
  const typedRef = useRef('');

  // nothing to label: back to Normal at once
  useEffect(() => {
    if (placed.length === 0) dispatcher.setMode('normal');
  }, [dispatcher, placed]);

  useEffect(() => {
    const cancel = () => dispatcher.setMode('normal');
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const key = event.key;
      if (key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        typedRef.current = typedRef.current.slice(0, -1);
        setTyped(typedRef.current);
        return;
      }
      if (key.length !== 1 || !/[a-z]/i.test(key)) return;
      event.preventDefault();
      event.stopPropagation();
      const next = typedRef.current + key.toLowerCase();
      const matches = placed.filter(({ label }) => label.startsWith(next));
      if (matches.length === 0) return;
      typedRef.current = next;
      setTyped(next);
      const exact = matches.find(({ label }) => label === next);
      if (exact) {
        dispatcher.setMode('normal');
        // after this key, so a click opening something doesn't take it
        queueMicrotask(() => exact.target.activate());
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', cancel);
    window.addEventListener('wheel', cancel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('wheel', cancel);
    };
  }, [dispatcher, placed]);

  return createPortal(
    <div className={styles.overlay} aria-hidden data-testid="hints">
      {placed
        .filter(({ label }) => label.startsWith(typed))
        .map(({ label, top, left }) => (
          <HintLabel
            key={label}
            label={label}
            typed={typed.length}
            className={styles.label}
            style={{ top, left }}
          />
        ))}
    </div>,
    document.body,
  );
}
