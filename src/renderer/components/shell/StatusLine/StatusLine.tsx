import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useFormatKeys } from '../../lib/platform';
import styles from './StatusLine.module.css';

/** The keyboard modes the line has a colour for. */
export type StatusLineMode = 'normal' | 'insert' | 'visual' | 'hint' | 'command';

/** A key worth knowing in the mode: `{ keys: 'Esc', label: 'cancel' }`. */
export interface StatusLineHint {
  /** written as on macOS (`⌘B`, `Esc`, `h j k l`); named for the platform */
  keys: string;
  label: string;
}

export interface StatusLineProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  mode: StatusLineMode;
  /** the tag's text; the mode in capitals by default ("VISUAL LINE" in the editor) */
  label?: string;
  /** where the cursor is: "Tasks › List · 3/8" */
  context?: ReactNode;
  /** what has been typed of a count or a sequence: "3d", "g" */
  pending?: string;
  /** the keys worth knowing right now, on the right */
  hints?: readonly StatusLineHint[];
  /** in place of the context and the pending keys: the `:` line's input */
  children?: ReactNode;
  /** drawn over the page above the line's left end: what can follow `g`, or completions */
  popup?: ReactNode;
}

/**
 * Vim mode's mode line (Figma `VimStatusline`, `7702:55408`): a 28px bar across the bottom of the
 * window, the mode in a coloured tag (Normal blue, Insert green, Visual amber, Hint pink, Command
 * indigo), where the cursor is and any keys typed so far, and on the right the keys worth knowing
 * in that mode. It draws what it is given and binds no keys: the keyboard layer's `ModeLine`
 * fills it in.
 */
export const StatusLine = forwardRef<HTMLDivElement, StatusLineProps>(function StatusLine(
  { mode, label, context, pending, hints = [], children, popup, className, ...props },
  ref,
) {
  const formatKeys = useFormatKeys();
  return (
    <div ref={ref} data-mode={mode} className={cn(styles.line, className)} {...props}>
      {popup && <div className={styles.popup}>{popup}</div>}
      <span className={styles.mode} role="status" aria-label={`${label ?? mode} mode`}>
        {label ?? mode.toUpperCase()}
      </span>
      <div className={styles.body}>
        {children ?? (
          <>
            {context != null && <span className={styles.context}>{context}</span>}
            {pending && <span className={styles.pending}>{pending}</span>}
          </>
        )}
      </div>
      {hints.length > 0 && (
        <ul className={styles.hints} aria-label="Keys">
          {hints.map((hint) => (
            <li key={`${hint.keys} ${hint.label}`} className={styles.hint}>
              <kbd className={styles.keys}>{formatKeys(hint.keys)}</kbd>
              {hint.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
