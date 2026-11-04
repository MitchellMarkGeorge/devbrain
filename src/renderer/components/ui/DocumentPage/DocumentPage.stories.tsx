import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ellipsis, FileText, Star } from 'lucide-react';
import { Heading } from '../../layout/Heading';
import { Breadcrumb } from '../Breadcrumb';
import { EditorContent } from '../EditorContent';
import { IconButton } from '../IconButton';
import { TooltipProvider } from '../Tooltip';
import { DocumentPage } from './DocumentPage';

const meta = {
  title: 'Components/DocumentPage',
  component: DocumentPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DocumentPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const header = (
  <header
    style={{ display: 'flex', alignItems: 'center', gap: 4, height: 48, padding: '0 16px 0 24px' }}
  >
    <Breadcrumb
      style={{ flex: 1 }}
      items={[
        { label: 'Notes', href: '#' },
        { label: 'PKCE design notes', icon: FileText },
      ]}
    />
    <IconButton size="sm" tone="muted" icon={Star} label="Favorite" />
    <IconButton size="sm" tone="muted" icon={Ellipsis} label="More actions" />
  </header>
);

/** The header spans the page; the 720px column centres in it and keeps its width */
export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <div style={{ height: 600 }}>
        <DocumentPage header={header}>
          <Heading level={1} variant="document">
            PKCE design notes
          </Heading>
          <EditorContent style={{ marginTop: 32 }}>
            <p>
              Mobile and desktop clients move to the authorization code flow with PKCE. The client
              never holds a secret: each login proves it started the flow with a one-time code
              verifier.
            </p>
          </EditorContent>
        </DocumentPage>
      </div>
    </TooltipProvider>
  ),
};

/** Settings and Integrations: the same 720px column */
export const Settings: Story = {
  render: () => (
    <div style={{ height: 300 }}>
      <DocumentPage>
        <Heading level={1} variant="document">
          Settings
        </Heading>
      </DocumentPage>
    </div>
  ),
};
