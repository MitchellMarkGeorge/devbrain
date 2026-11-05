import {
  forwardRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { Kbd } from '../../ui/Kbd';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { StatusIcon } from '../../entities/StatusIcon';
import type { Priority } from '../../types';
import styles from './QuickAddRow.module.css';

export interface QuickAddRowProps extends Omit<ComponentProps<'div'>, 'children' | 'onSubmit'> {
  /** the placeholder at rest: "Add task…" */
  placeholder?: string;
  /** the typed title, when controlled */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** ↵ with a title: creates the task; the row clears and stays open for the next one */
  onCreate?: (title: string) => void;
  /** the pills the new task inherits from its group (its project, event or note), shown while typing */
  children?: ReactNode;
  /** the default priority and due date shown while typing */
  priority?: Priority;
  date?: string;
  dateTone?: 'today' | 'overdue';
  /** draws the typing state without focus, for pictures of the row */
  state?: 'typing';
  /** focuses the input on mount */
  autoFocus?: boolean;
}

/**
 * The inline "Add task…" row that ends a list group (or a board column): at rest a "+" and the
 * placeholder; typing, it takes the ring, the not-started icon, and on the right the pills the
 * task inherits from its group, its default priority and date and a ↵ key. ↵ creates the task and
 * keeps the row open for the next one; Esc clears it.
 */
export const QuickAddRow = forwardRef<HTMLDivElement, QuickAddRowProps>(function QuickAddRow(
  {
    placeholder = 'Add task…',
    value: valueProp,
    defaultValue = '',
    onValueChange,
    onCreate,
    children,
    priority = 'medium',
    date,
    dateTone,
    state,
    autoFocus,
    className,
    ...props
  },
  ref,
) {
  const [valueState, setValueState] = useState(defaultValue);
  const value = valueProp ?? valueState;
  const [focused, setFocused] = useState(false);
  const typing = state === 'typing' || focused;

  function setValue(next: string) {
    setValueState(next);
    onValueChange?.(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && value.trim()) {
      event.preventDefault();
      onCreate?.(value.trim());
      setValue('');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setValue('');
      event.currentTarget.blur();
    }
  }

  return (
    <div
      ref={ref}
      data-typing={typing ? '' : undefined}
      data-state={state}
      className={cn(styles.row, className)}
      {...props}
    >
      <span className={styles.icon} aria-hidden>
        {typing ? <StatusIcon status="not-started" /> : <Icon icon={Plus} size={16} />}
      </span>
      <input
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, '')}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {typing && (
        <span className={styles.side}>
          {children}
          <PriorityIcon priority={priority} />
          {date && (
            <span className={styles.date} data-tone={dateTone}>
              {date}
            </span>
          )}
          <Kbd>↵</Kbd>
        </span>
      )}
    </div>
  );
});
