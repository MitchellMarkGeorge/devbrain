import { useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  DialogDescription,
  DialogTitle,
  Field,
  Input,
  SwatchPicker,
  WorkspaceTile,
  type Swatch,
} from '../../components';
import { ipcErrorOf } from '../../ipc/errors';
import { SWATCH_HEX } from './colors';
import { useWorkspaceActions } from './workspace-actions';
import styles from './CreateWorkspaceForm.module.css';

// One form for a new workspace, a name and a colour with the tile previewing them, in the two
// places it is designed: the onboarding card (`/onboarding/new_workspace`, Figma 7175:20087) and
// the dialog inside the app (Figma 7760:61769). Submitting creates the workspace and opens it, under
// the splash.

export interface CreateWorkspaceFormState {
  // the form's id, for a submit button outside it
  formId: string;
  canSubmit: boolean;
}

export interface CreateWorkspaceFormProps {
  title: string;
  description: string;
  // the tile's size: 56 on the card, 40 in the dialog
  tileSize: number;
  // in a dialog, the title and description are the dialog's own (its accessible name)
  inDialog?: boolean;
  // lays the form out: the fields, then the buttons (which submit `formId`)
  children: (form: { fields: ReactNode } & CreateWorkspaceFormState) => ReactNode;
}

export function CreateWorkspaceForm({
  title,
  description,
  tileSize,
  inDialog = false,
  children,
}: CreateWorkspaceFormProps) {
  const { create, busy } = useWorkspaceActions();
  const formId = useId();
  const [name, setName] = useState('');
  const [swatch, setSwatch] = useState<Swatch>('blue');
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || busy) return;
    setError(null);
    create({ name: trimmed, color: SWATCH_HEX[swatch] }).catch((failure: unknown) =>
      setError(ipcErrorOf(failure)?.message ?? 'The workspace couldn’t be created.'),
    );
  };

  const fields = (
    <form id={formId} className={styles.fields} onSubmit={submit}>
      <div className={styles.intro}>
        <WorkspaceTile letter={trimmed || 'W'} color={swatch} size={tileSize} />
        <div className={styles.introText}>
          {inDialog ? (
            <>
              <DialogTitle className={styles.title}>{title}</DialogTitle>
              <DialogDescription className={styles.description}>{description}</DialogDescription>
            </>
          ) : (
            <>
              <h2 className={styles.title}>{title}</h2>
              <p className={styles.description}>{description}</p>
            </>
          )}
        </div>
      </div>
      <Field label="Workspace name" error={error}>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="Personal"
        />
      </Field>
      <Field label="Colour">
        <SwatchPicker value={swatch} onValueChange={setSwatch} />
      </Field>
    </form>
  );
  return children({ fields, formId, canSubmit: trimmed !== '' && !busy });
}
