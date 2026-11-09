import { useState, type ReactElement, type ReactNode } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../Dialog';
import { Field } from '../Field';
import { Input } from '../Input';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  /** a question naming the thing: "Delete task permanently?", "Disconnect Linear?" */
  title: ReactNode;
  /** what happens, to it and to what links to it */
  description: ReactNode;
  /** adds "This can’t be undone." under the description */
  irreversible?: boolean;
  /** the destructive action's label, verb and noun: "Delete Task", "Disconnect" */
  actionLabel: ReactNode;
  onConfirm?: () => void;
  /** keeps the action disabled (an option still to choose) */
  actionDisabled?: boolean;
  cancelLabel?: ReactNode;
  /**
   * a name to type before the action enables ("SurveyMonkey"): adds the "Type “…” to confirm"
   * field
   */
  confirmText?: string;
  /** more of the body, under the header: a `ConfirmDialogChoices` */
  children?: ReactNode;
  /** the element that opens it; leave it out and control `open` */
  trigger?: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** once the opening or closing animation has finished (`useModals` removes the dialog then) */
  onOpenChangeComplete?: (open: boolean) => void;
}

/**
 * The confirmation before a destructive action (an `AlertDialog`: no ×, it closes through its
 * buttons or Esc): a title, the consequence, "This can’t be undone." when it can’t, optional
 * choices or a name to type, then a ghost Cancel and the destructive action in the footer band.
 */
export function ConfirmDialog({
  title,
  description,
  irreversible,
  actionLabel,
  onConfirm,
  actionDisabled,
  cancelLabel = 'Cancel',
  confirmText,
  children,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  onOpenChangeComplete,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const mismatch = confirmText != null && typed !== confirmText;
  return (
    <AlertDialog
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => {
        if (!next) setTyped('');
        onOpenChange?.(next);
      }}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent>
        <div className={styles.body}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription render={<div />} className={styles.description}>
              <p>{description}</p>
              {irreversible && <p>This can’t be undone.</p>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {children}
          {confirmText != null && (
            <Field label={`Type “${confirmText}” to confirm`} className={styles.field}>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>{cancelLabel}</AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            disabled={actionDisabled || mismatch}
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface ConfirmDialogChoice<Value extends string> {
  value: Value;
  label: ReactNode;
  /** what this choice does, counted: "Deletes 6 tasks and 1 project." */
  description?: ReactNode;
}

export interface ConfirmDialogChoicesProps<Value extends string> {
  /** the question over the cards ("Synced items") */
  label: ReactNode;
  choices: readonly ConfirmDialogChoice<Value>[];
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
  className?: string;
}

/**
 * The choice a confirmation asks for (what happens to synced items on disconnect): a label over
 * radio cards, each with a 14px name and a 12px consequence. The chosen card takes the `ring`
 * outline.
 */
export function ConfirmDialogChoices<Value extends string>({
  label,
  choices,
  value,
  defaultValue,
  onValueChange,
  className,
}: ConfirmDialogChoicesProps<Value>) {
  return (
    <div className={cn(styles.choices, className)}>
      <div className={styles.choicesLabel}>{label}</div>
      <RadioGroup
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onValueChange?.(next as Value)}
        className={styles.cards}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        {choices.map((choice) => (
          <label key={choice.value} className={styles.card}>
            <Radio.Root value={choice.value} className={styles.radio}>
              <Radio.Indicator className={styles.dot} />
            </Radio.Root>
            <span className={styles.cardText}>
              <span className={styles.cardLabel}>{choice.label}</span>
              {choice.description != null && (
                <span className={styles.cardDescription}>{choice.description}</span>
              )}
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
