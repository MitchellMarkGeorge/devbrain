import { forwardRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from 'react';
import { Calendar, CircleCheck, FileText } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Kbd } from '../../ui/Kbd';
import { Logomark } from '../../ui/Logomark';
import { ToggleGroup } from '../../ui/ToggleGroup';
import styles from './QuickCapture.module.css';

export type CaptureKind = 'task' | 'note' | 'event';

const KINDS = [
  { value: 'task', label: 'Task', icon: CircleCheck },
  { value: 'note', label: 'Note', icon: FileText },
  { value: 'event', label: 'Event', icon: Calendar },
];

export interface QuickCaptureProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onSubmit'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** what Enter creates */
  kind?: CaptureKind;
  defaultKind?: CaptureKind;
  onKindChange?: (kind: CaptureKind) => void;
  /** Enter with text: create the task, note or event; the field clears */
  onSubmit?: (value: string, kind: CaptureKind) => void;
  placeholder?: string;
}

/**
 * Home's capture bar: one 56px field that creates a task, note or event. The mark, the field,
 * "/ for commands", then the Task / Note / Event switch. Home shows the `UpNextStrip` in its place
 * while a meeting is coming up.
 */
export const QuickCapture = forwardRef<HTMLDivElement, QuickCaptureProps>(function QuickCapture(
  {
    value: valueProp,
    defaultValue = '',
    onValueChange,
    kind: kindProp,
    defaultKind = 'task',
    onKindChange,
    onSubmit,
    placeholder = 'Capture a task, note or event…',
    className,
    ...props
  },
  ref,
) {
  const [ownValue, setOwnValue] = useState(defaultValue);
  const [ownKind, setOwnKind] = useState<CaptureKind>(defaultKind);
  const value = valueProp ?? ownValue;
  const kind = kindProp ?? ownKind;
  const setValue = (next: string) => {
    setOwnValue(next);
    onValueChange?.(next);
  };
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && value.trim()) {
      event.preventDefault();
      onSubmit?.(value.trim(), kind);
      setValue('');
    }
  };
  return (
    <div ref={ref} className={cn(styles.capture, className)} {...props}>
      <Logomark size="sm" alt="" />
      <input
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={`New ${kind}`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKey}
      />
      <span className={styles.hint}>
        <Kbd className={styles.key}>/</Kbd>
        for commands
      </span>
      <ToggleGroup
        aria-label="Create"
        className={styles.kind}
        items={KINDS}
        value={kind}
        onValueChange={(next) => {
          setOwnKind(next as CaptureKind);
          onKindChange?.(next as CaptureKind);
        }}
      />
    </div>
  );
});
