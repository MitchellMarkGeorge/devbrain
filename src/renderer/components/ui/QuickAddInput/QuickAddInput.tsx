import { forwardRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../Icon';
import { Kbd } from '../Kbd';
import styles from './QuickAddInput.module.css';

export interface QuickAddInputProps extends Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'defaultValue' | 'onSubmit'
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Enter with text: add it (the first-run Home adds a task due today); the field clears */
  onSubmit?: (value: string) => void;
  /** on a `popover` (a SetupPrompt) the ↵ key takes `border-strong` so it still shows */
  surface?: 'page' | 'popover';
}

/**
 * The first-run Home's inline quick-add: a 32px field with a plus, the placeholder ("What are you
 * working on today?") and a ↵ key at the right. Enter adds what was typed and clears the field.
 */
export const QuickAddInput = forwardRef<HTMLInputElement, QuickAddInputProps>(
  function QuickAddInput(
    {
      value: valueProp,
      defaultValue = '',
      onValueChange,
      onSubmit,
      surface = 'page',
      placeholder = 'What are you working on today?',
      className,
      style,
      onKeyDown,
      ...props
    },
    ref,
  ) {
    const [own, setOwn] = useState(defaultValue);
    const value = valueProp ?? own;
    const set = (next: string) => {
      setOwn(next);
      onValueChange?.(next);
    };
    const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.key === 'Enter' && !event.nativeEvent.isComposing && value.trim()) {
        event.preventDefault();
        onSubmit?.(value.trim());
        set('');
      }
    };
    return (
      <label
        className={cn(styles.field, className)}
        style={style}
        data-surface={surface === 'popover' ? 'popover' : undefined}
      >
        <Icon icon={Plus} size={16} className={styles.plus} />
        <input
          ref={ref}
          className={styles.input}
          value={value}
          placeholder={placeholder}
          onChange={(event) => set(event.target.value)}
          onKeyDown={handleKey}
          {...props}
        />
        <Kbd className={styles.key}>↵</Kbd>
      </label>
    );
  },
);
