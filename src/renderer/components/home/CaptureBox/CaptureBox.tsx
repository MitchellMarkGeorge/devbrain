import {
  forwardRef,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Calendar, CircleCheck, Clock, FileText, Flag, Folder, Timer } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button, type ButtonProps } from '../../ui/Button';
import { Kbd } from '../../ui/Kbd';
import { ToggleGroup } from '../../ui/ToggleGroup';
import styles from './CaptureBox.module.css';

export type CaptureKind = 'task' | 'note' | 'event';

const KINDS = [
  { value: 'task', label: 'Task', icon: CircleCheck },
  { value: 'note', label: 'Note', icon: FileText },
  { value: 'event', label: 'Event', icon: Calendar },
];

const PLACEHOLDERS: Record<CaptureKind, string> = {
  task: 'What needs doing?',
  note: 'What’s it about?',
  event: 'What’s happening?',
};

/** One of the box's detail pickers: a ghost sm button that opens its menu or picker. */
export const CaptureBoxPicker = forwardRef<HTMLButtonElement, ButtonProps>(
  function CaptureBoxPicker(props, ref) {
    return <Button ref={ref} variant="ghost" size="sm" {...props} />;
  },
);

/** The pickers a kind starts with, before anything is typed or picked. */
function DefaultPickers({ kind }: { kind: CaptureKind }) {
  if (kind === 'event') {
    return (
      <>
        <CaptureBoxPicker icon={Calendar}>Calendar</CaptureBoxPicker>
        <CaptureBoxPicker icon={Clock}>Time</CaptureBoxPicker>
        <CaptureBoxPicker icon={Timer}>30 min</CaptureBoxPicker>
      </>
    );
  }
  return (
    <>
      <CaptureBoxPicker icon={Folder}>No project</CaptureBoxPicker>
      {kind === 'task' && (
        <>
          <CaptureBoxPicker icon={Calendar}>Today</CaptureBoxPicker>
          <CaptureBoxPicker icon={Flag}>Priority</CaptureBoxPicker>
        </>
      )}
    </>
  );
}

/** Draws `text` with each recognised token marked, behind the field's own text. */
function Highlights({ text, tokens }: { text: string; tokens: string[] }) {
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    let at = -1;
    let token = '';
    for (const candidate of tokens) {
      const index = candidate ? rest.indexOf(candidate) : -1;
      if (index !== -1 && (at === -1 || index < at)) {
        at = index;
        token = candidate;
      }
    }
    if (at === -1) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, at));
    parts.push(
      <mark key={key++} className={styles.token}>
        {token}
      </mark>,
    );
    rest = rest.slice(at + token.length);
  }
  return <>{parts}</>;
}

export interface CaptureBoxProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onSubmit'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** what the box creates */
  kind?: CaptureKind;
  defaultKind?: CaptureKind;
  onKindChange?: (kind: CaptureKind) => void;
  /** Enter with text, or the Add button: create the task, note or event; the field clears */
  onSubmit?: (value: string, kind: CaptureKind) => void;
  /** the field's placeholder (by kind: "What needs doing?") */
  placeholder?: string;
  /**
   * the ghost sm pickers under the field (`CaptureBoxPicker`s): project, due date and priority
   * for a task, calendar, time and length for an event. Defaults to the kind's empty pickers.
   */
  pickers?: ReactNode;
  /**
   * the parts of the text the caller recognised ("tomorrow", "#Auth Overhaul"), marked in the
   * field; their pickers show what they filled in
   */
  highlights?: string[];
  /** the primary button's label (by kind: "Add task", "Add note", "Add event") */
  submitLabel?: string;
  /** the one-line tip under the box */
  tip?: ReactNode;
}

/**
 * Home's capture box: the Task / Note / Event switch and "/ for commands", a free-text field, the
 * kind's pickers and the Add button. It holds the slot an AI prompt will take later, at the same
 * size. Recognised words in the field are marked and fill their pickers.
 */
export const CaptureBox = forwardRef<HTMLDivElement, CaptureBoxProps>(function CaptureBox(
  {
    value: valueProp,
    defaultValue = '',
    onValueChange,
    kind: kindProp,
    defaultKind = 'task',
    onKindChange,
    onSubmit,
    placeholder,
    pickers,
    highlights,
    submitLabel,
    tip,
    className,
    ...props
  },
  ref,
) {
  const [ownValue, setOwnValue] = useState(defaultValue);
  const [ownKind, setOwnKind] = useState<CaptureKind>(defaultKind);
  const backdrop = useRef<HTMLDivElement>(null);
  const value = valueProp ?? ownValue;
  const kind = kindProp ?? ownKind;
  const setValue = (next: string) => {
    setOwnValue(next);
    onValueChange?.(next);
  };
  const submit = () => {
    if (!value.trim()) return;
    onSubmit?.(value.trim(), kind);
    setValue('');
  };
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <div ref={ref} className={cn(styles.root, className)} {...props}>
      <div className={styles.box}>
        <div className={styles.top}>
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
          <span className={styles.hint}>
            <Kbd variant="raised">/</Kbd>
            for commands
          </span>
        </div>
        <div className={styles.field}>
          {highlights && highlights.length > 0 && (
            <div ref={backdrop} className={styles.backdrop} aria-hidden>
              <Highlights text={value} tokens={highlights} />
            </div>
          )}
          <input
            className={styles.input}
            value={value}
            placeholder={placeholder ?? PLACEHOLDERS[kind]}
            aria-label={`New ${kind}`}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKey}
            onScroll={(event) => {
              if (backdrop.current) backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
          />
        </div>
        <div className={styles.details}>
          <div className={styles.pickers}>{pickers ?? <DefaultPickers kind={kind} />}</div>
          <Button variant="primary" size="sm" onClick={submit}>
            {submitLabel ?? `Add ${kind}`}
          </Button>
        </div>
      </div>
      {tip != null && <p className={styles.tip}>{tip}</p>}
    </div>
  );
});
