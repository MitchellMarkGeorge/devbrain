import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import styles from './CreateWorkspaceForm.module.css';

/** Create workspace on the onboarding screen (Figma 7175:20087): the form, then Back and Create. */
export function CreateWorkspaceCard() {
  const navigate = useNavigate();
  return (
    <CreateWorkspaceForm
      title="Create a workspace"
      description="A workspace is a folder that holds your tasks, notes and connected accounts."
      tileSize={56}
    >
      {({ fields, formId, canSubmit }) => (
        <div className={styles.card}>
          <div className={styles.cardBody}>{fields}</div>
          <div className={styles.cardFooter}>
            <Button
              variant="ghost"
              icon={ArrowLeft}
              onClick={() => navigate({ to: '/onboarding' })}
            >
              Back
            </Button>
            <Button type="submit" form={formId} disabled={!canSubmit}>
              Create Workspace
            </Button>
          </div>
        </div>
      )}
    </CreateWorkspaceForm>
  );
}
