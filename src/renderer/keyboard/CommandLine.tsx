import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { StatusLine, type StatusLineHint } from '../components';
import { completeCommandLine, resolveCommandLine, type Completion } from './command-line';
import { MODE_ATTRIBUTE } from './keymap';
import { useCommandList, useKeyboard } from './KeyboardProvider';
import styles from './CommandLine.module.css';

/** The mode `:` puts the keyboard in. */
export const COMMAND_MODE = 'command';

const HINTS: StatusLineHint[] = [
  { keys: 'Tab', label: 'next' },
  { keys: '↵', label: 'run' },
  { keys: 'Esc', label: 'cancel' },
];

/**
 * Vim's `:` line (Figma `7704:58025`): the mode line in Command mode, an input in place of its
 * context and completions above it, from the command registry (`completeCommandLine`). Tab or ↓
 * picks the next completion, ⇧Tab or ↑ the one before; ↵ runs the one picked (or what was typed, in
 * full); Esc, or Backspace on an empty line, cancels. Either way focus goes back to where it was
 * before `:`, and a command runs there, in its scopes. `ModeLine` draws it in Command mode.
 */
export function CommandLine({ onClose }: { onClose?: () => void }) {
  const { dispatcher } = useKeyboard();
  const commands = useCommandList();
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState(0);
  // where focus was before `:`: it goes back there, and the command runs there
  const [returnTo] = useState(() => document.activeElement);
  const completions = useMemo(() => completeCommandLine(typed, commands), [typed, commands]);
  const listId = useId();
  const current = completions.length > 0 ? completions[picked % completions.length] : undefined;

  function close() {
    dispatcher.setMode('normal');
    if (returnTo instanceof HTMLElement && returnTo.isConnected && returnTo !== document.body) {
      returnTo.focus({ preventScroll: true });
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onClose?.();
  }

  function run(completion: Completion | undefined) {
    close();
    if (completion) dispatcher.run(completion.command, completion.args ?? {});
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = (by: number) => {
      event.preventDefault();
      if (completions.length > 0) {
        setPicked((index) => (index + by + completions.length) % completions.length);
      }
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(current ?? resolveCommandLine(typed, commands));
    } else if (event.key === 'Tab') {
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === 'ArrowDown') {
      step(1);
    } else if (event.key === 'ArrowUp') {
      step(-1);
    } else if (event.key === 'Backspace' && typed === '') {
      event.preventDefault();
      close();
    }
  }

  let popup: ReactNode = null;
  if (completions.length > 0) {
    popup = (
      <div className={styles.completions}>
        <span className={styles.heading}>Commands</span>
        <ul id={listId} role="listbox" aria-label="Commands" className={styles.list}>
          {completions.map((completion, i) => (
            <li
              key={`${completion.text}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={completion === current}
              data-picked={completion === current ? '' : undefined}
              className={styles.option}
              // a click runs it; mousedown keeps focus in the line until then
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(completion)}
            >
              <span className={styles.text}>:{completion.text}</span>
              <span className={styles.label}>{completion.label}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <StatusLine mode="command" hints={HINTS} popup={popup}>
      <div {...{ [MODE_ATTRIBUTE]: COMMAND_MODE }} className={styles.line}>
        <span aria-hidden className={styles.colon}>
          :
        </span>
        <input
          // the line opens with `:` and takes focus at once, as Vim's does; focus leaving it for
          // anything else ends Command mode (the dispatcher follows focus)
          autoFocus
          className={styles.input}
          value={typed}
          aria-label="Command"
          role="combobox"
          aria-expanded={completions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current ? `${listId}-${completions.indexOf(current)}` : undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setTyped(event.currentTarget.value);
            setPicked(0);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
    </StatusLine>
  );
}
