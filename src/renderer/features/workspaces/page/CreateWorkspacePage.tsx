import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
  AppShell,
  Button,
  Field,
  Input,
  SwatchPicker,
  WorkspaceTile,
  type Swatch,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { SWATCH_HEX } from '@renderer/shared/lib/workspace/colors';
import { ipcErrorOf } from '@renderer/shared/lib/workspace/errors';
import { useHistoryPosition } from '@renderer/shared/hooks/use-history-position';
import styles from './CreateWorkspacePage.module.css';

/**
 * Create workspace (`/workspaces/new`, Figma 7175:20087): a page of its own, from Welcome and from
 * the workspace menu, with the form on a card: the tile, a name and a colour. Creating goes to the new workspace, in place of this
 * page in the history, which opens it under the splash. Back (or Esc) returns to where it was
 * opened from: Welcome, or the workspace still open behind it.
 */
export function CreateWorkspacePage() {
  const router = useRouter();
  const navigate = useNavigate();
  const { canGoBack } = useHistoryPosition();
  const open = useQuery(trpc.workspaces.current.queryOptions()).data ?? null;
  const [name, setName] = useState('');
  const [color, setColor] = useState<Swatch>('green');
  const [nameError, setNameError] = useState<string | null>(null);
  const create = useMutation(
    trpc.workspaces.create.mutationOptions({
      onSuccess: (workspace) =>
        void navigate({
          to: '/app/$workspaceId',
          params: { workspaceId: workspace.id },
          replace: true,
        }),
    }),
  );

  const back = () => {
    if (canGoBack) router.history.back();
    else if (open) void navigate({ to: '/app/$workspaceId', params: { workspaceId: open.id } });
    else void navigate({ to: '/onboarding' });
  };
  const pending = create.isPending;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !pending) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      setNameError('Enter a name for the workspace.');
      return;
    }
    create.mutate({ name: name.trim(), color: SWATCH_HEX[color] });
  };

  return (
    <AppShell>
      <form className={styles.card} onSubmit={submit} aria-label="Create workspace" noValidate>
        <div className={styles.body}>
          <div className={styles.intro}>
            <WorkspaceTile letter={name.trim() || 'W'} color={color} size={56} />
            <div className={styles.text}>
              <h1 className={styles.title}>Create a workspace</h1>
              <p className={styles.description}>
                A workspace is a folder with its own tasks, notes and connected accounts.
                {open && ' It opens once it’s created.'}
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
        <div className={styles.footer}>
          <Button type="button" variant="ghost" icon={ArrowLeft} onClick={back}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            Create Workspace
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
