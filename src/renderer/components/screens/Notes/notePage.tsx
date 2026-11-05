/* The note editor page the Notes and Editor screen stories share. */
import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { DocumentPage } from '../../shell/DocumentPage';
import { EditorTitle } from '../../editor/EditorContent';
import { AppWindow, DetailTopBar } from '../TaskDetail/frame';

export function NotePage({
  title,
  edited,
  pills,
  children,
}: {
  title: string;
  edited: string;
  pills: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppWindow active="Notes">
      <DocumentPage
        style={{ flex: 1 }}
        header={
          <DetailTopBar
            items={[
              { label: 'Notes', href: '#' },
              { label: title, icon: FileText },
            ]}
          />
        }
      >
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <EditorTitle>{title}</EditorTitle>
          <span
            style={{
              marginTop: 2,
              color: 'var(--subtle-foreground)',
              fontSize: 12,
              lineHeight: '16px',
            }}
          >
            {edited}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>{pills}</div>
          <div style={{ marginTop: 32 }}>{children}</div>
        </div>
      </DocumentPage>
    </AppWindow>
  );
}
