import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { WorkspaceInfo } from '@common/types';
import { Button, Field, Input, SwatchPicker, WorkspaceTile, type Swatch } from '../../components';
import { trpc } from '../../ipc';
import { SWATCH_HEX } from '../../workspace/colors';
import { ipcErrorOf } from '../../workspace/errors';
import styles from './CreateWorkspaceForm.module.css';

export interface CreateWorkspaceFormProps {
  /** `page`: onboarding's card, with Back; `dialog`: the in-app dialog's body, with Cancel */
  layout: 'page' | 'dialog';
  /** the heading: a plain title on the page, the `DialogTitle` in the dialog */
  title: ReactNode;
  onCancel: () => void;
  /** the workspace was created (not yet opened): the caller goes to it */
  onCreated: (workspace: WorkspaceInfo) => void;
}

/**
 * Create workspace: the tile, a name and a colour. One form for onboarding's page
 * (/onboarding/new_workspace) and the app's New workspace dialog, so both create the same way:
 * workspaces.create, then the caller navigates to the new workspace, which opens it.
 */
export function CreateWorkspaceForm({
  layout,
  title,
  onCancel,
  onCreated,
}: CreateWorkspaceFormProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<Swatch>('green');
  const [nameError, setNameError] = useState<string | null>(null);
  const create = useMutation(trpc.workspaces.create.mutationOptions({ onSuccess: onCreated }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      setNameError('Enter a name for the workspace.');
      return;
    }
    create.mutate({ name: name.trim(), color: SWATCH_HEX[color] });
  };

  return (
    <form
      className={layout === 'page' ? `${styles.form} ${styles.card}` : styles.form}
      onSubmit={submit}
      aria-label="Create workspace"
      noValidate
    >
      <div className={styles.body}>
        <div className={styles.intro}>
          <WorkspaceTile letter={name.trim() || 'W'} color={color} size={56} />
          <div className={styles.text}>
            {title}
            <p className={styles.description}>
              A workspace is a folder with its own tasks, notes and connected accounts.
              {layout === 'dialog' && ' It opens once it’s created.'}
            </p>
          </div>
        </div>
        <Field label="Workspace name" error={nameError ?? undefined}>
          <Input
            value={name}
            autoFocus
            placeholder="Personal"
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
          />
        </Field>
        <Field label="Colour">
          <SwatchPicker value={color} onValueChange={setColor} aria-label="Colour" />
        </Field>
        {create.error && (
          <p className={styles.description} role="alert">
            {ipcErrorOf(create.error)?.message ?? 'The workspace couldn’t be created.'}
          </p>
        )}
      </div>
      <div className={styles.footer} data-layout={layout}>
        {layout === 'page' ? (
          <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onCancel}>
            Back
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={create.isPending}>
          Create Workspace
        </Button>
      </div>
    </form>
  );
}

/** The heading of the onboarding page's form. */
export function CreateWorkspaceTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.title}>{children}</h2>;
}
