import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { WorkspaceInfo } from '@common/types';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Field,
  Input,
  SwatchPicker,
  toast,
  WorkspaceTile,
  type Swatch,
} from '../../components';
import { useServices } from '../../app/context';
import { SWATCH_HEX } from '../../app/swatches';
import { ipcFailureOf, type IpcFailure } from '../../ipc/errors';
import styles from './onboarding.module.css';

const DEFAULT_SWATCH: Swatch = 'green';

export interface CreateWorkspaceFormProps {
  /**
   * `page`: the card on `/onboarding/new_workspace`, with Back. `dialog`: the body of the Create
   * workspace dialog inside the app, with Cancel.
   */
  variant: 'page' | 'dialog';
  /** Back or Cancel */
  onCancel: () => void;
  /** the workspace was created; it opens next */
  onCreated?: (workspace: WorkspaceInfo) => void;
  /** creating it, or opening it once `created`, failed */
  onFailure: (failure: IpcFailure | null, stage: { created: boolean }) => void;
}

/**
 * Creating a workspace: a name, a colour and the live tile, then Create Workspace, which creates it
 * and opens it. The open shows the switch splash and the root goes to its landing page, so the form
 * has nothing to do after. Shared by onboarding and the in-app dialog (docs/renderer plan,
 * Onboarding: why a dialog inside the app).
 */
export function CreateWorkspaceForm({
  variant,
  onCancel,
  onCreated,
  onFailure,
}: CreateWorkspaceFormProps) {
  const { ipc } = useServices();
  const [name, setName] = useState('');
  const [swatch, setSwatch] = useState<Swatch>(DEFAULT_SWATCH);
  const [missingName, setMissingName] = useState(false);
  const [pending, setPending] = useState(false);
  const formId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setMissingName(true);
      return;
    }
    setPending(true);
    let created = false;
    try {
      const workspace = await ipc.workspaces.create.mutate({
        name: trimmed,
        color: SWATCH_HEX[swatch],
      });
      created = true;
      onCreated?.(workspace);
      await ipc.workspaces.open.mutate({ id: workspace.id });
    } catch (error) {
      onFailure(ipcFailureOf(error), { created });
    } finally {
      setPending(false);
    }
  };

  const dialog = variant === 'dialog';
  const title = dialog ? 'New workspace' : 'Create a workspace';
  const description = dialog
    ? 'A workspace is a folder with its own tasks, notes and connected accounts. It opens once it’s created.'
    : 'A workspace is a folder that holds your tasks, notes and connected accounts.';

  const body = (
    <>
      <div className={styles.intro}>
        <WorkspaceTile letter={name.trim() || 'W'} color={swatch} size={dialog ? 48 : 56} />
        <div className={styles.introText}>
          {dialog ? (
            <>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </>
          ) : (
            <>
              <h2 className={styles.title}>{title}</h2>
              <p className={styles.description}>{description}</p>
            </>
          )}
        </div>
      </div>
      <Field
        label="Workspace name"
        error={missingName ? 'Enter a name for the workspace.' : undefined}
      >
        <Input
          name="name"
          value={name}
          placeholder="Work"
          autoFocus
          autoComplete="off"
          onValueChange={(value: string) => {
            setName(value);
            if (value.trim() !== '') setMissingName(false);
          }}
        />
      </Field>
      <Field label="Colour">
        <SwatchPicker value={swatch} onValueChange={setSwatch} aria-label="Colour" />
      </Field>
    </>
  );

  const create = (
    <Button type="submit" form={formId} disabled={pending}>
      Create Workspace
    </Button>
  );

  if (dialog) {
    return (
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        {body}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />} onClick={onCancel}>
            Cancel
          </DialogClose>
          {create}
        </DialogFooter>
      </form>
    );
  }
  return (
    <form id={formId} className={styles.card} onSubmit={submit} noValidate>
      <div className={styles.cardBody}>{body}</div>
      <div className={styles.cardFooter}>
        <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onCancel}>
          Back
        </Button>
        {create}
      </div>
    </form>
  );
}

/**
 * "New workspace…" from the sidebar's workspace menu (Figma `7760:61527`): the form in a dialog over
 * the page. It closes once the workspace is created; the open then shows the switch splash, and a
 * failure to open it shows as a toast, since the dialog is gone.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false}>
        <CreateWorkspaceForm
          variant="dialog"
          onCancel={() => onOpenChange(false)}
          onCreated={() => onOpenChange(false)}
          onFailure={(failure, { created }) =>
            toast({
              tone: 'error',
              title: created ? 'Couldn’t open the new workspace' : 'Couldn’t create the workspace',
              description: failure?.message ?? 'Something went wrong.',
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
