import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  ConfirmDialogChoices,
  VisuallyHidden,
} from '../../../components';
import { KeyScope } from '../../../keyboard';
import type { ModalProps } from '../../../modals';
import type { OccurrenceScope, ScopeChoice } from './occurrence';
import styles from './ScopeDialog.module.css';

export interface ScopeDialogProps extends ModalProps {
  /** "Change a recurring event", "Delete Design Review?" */
  title: ReactNode;
  description: ReactNode;
  /** the choices, those unavailable for this change left out */
  choices: ScopeChoice[];
  /** each choice's consequence: "Only Mon, Jun 22." */
  describe: (scope: OccurrenceScope) => ReactNode;
  actionLabel: ReactNode;
  destructive?: boolean;
  onChoose: (scope: OccurrenceScope) => void;
}

export const SCOPE_LABELS: Record<OccurrenceScope, string> = {
  this: 'This event',
  following: 'This and following events',
  all: 'All events',
};

/**
 * Which occurrences of a series a change or delete applies to (Figma `7424:43188`, `7424:43411`):
 * radio cards for This event, This and following events and All events (those the change can't
 * apply to left out), then Cancel and the action. An alert dialog, like ConfirmDialog: it closes
 * through its buttons or Esc.
 */
export function ScopeDialog({
  title,
  description,
  choices,
  describe,
  actionLabel,
  destructive = false,
  onChoose,
  ...modal
}: ScopeDialogProps) {
  const available = choices.filter((choice) => !choice.unavailable);
  const [scope, setScope] = useState<OccurrenceScope>(available[0]?.scope ?? 'all');
  return (
    <AlertDialog {...modal}>
      <AlertDialogContent data-testid="scope-dialog">
        <KeyScope name="dialog" />
        <div className={styles.body}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmDialogChoices
            label={<VisuallyHidden>Which events</VisuallyHidden>}
            value={scope}
            onValueChange={setScope}
            choices={available.map((choice) => ({
              value: choice.scope,
              label: SCOPE_LABELS[choice.scope],
              description: describe(choice.scope),
            }))}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <AlertDialogClose
            render={<Button variant={destructive ? 'destructive' : 'default'} />}
            onClick={() => onChoose(scope)}
          >
            {actionLabel}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
