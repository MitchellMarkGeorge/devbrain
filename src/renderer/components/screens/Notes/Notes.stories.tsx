import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleCheck, Link, Plus } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { DetailSection } from '../../detail/DetailSection';
import { EditorContent } from '../../editor/EditorContent';
import { EntityPill } from '../../entities/EntityPill';
import { SheetDivider } from '../../ui/Sheet';
import { TaskList } from '../../lists/TaskList';
import { NotePage } from './notePage';

const meta = {
  title: 'Screens/Notes',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Note editor (linked tasks) (7158:16863): the note, then its Tasks panel */
export const NoteEditorLinkedTasks: Story = {
  name: 'Note editor (linked tasks)',
  render: () => (
    <NotePage
      title="Architecture ADR #4 — PKCE"
      edited="Edited yesterday"
      pills={
        <>
          <EntityPill type="project" color="blue">
            Auth Overhaul
          </EntityPill>
          <EntityPill glyph={CircleCheck}>3 tasks · 2 in progress</EntityPill>
        </>
      }
    >
      <EditorContent>
        <p>
          Status: accepted. The implicit flow returns tokens in the URL fragment, where they leak
          into browser history, logs and referrer headers.
        </p>
        <h2>Decision</h2>
        <p>Every first-party client moves to the authorization code flow with PKCE:</p>
        <ul>
          <li>Use the S256 challenge method and reject plain challenges.</li>
          <li>Generate a new 96-character code verifier for every sign-in.</li>
          <li>Expire authorization codes after 10 minutes.</li>
        </ul>
        <p>The implicit flow stays behind a feature flag for one release, then is removed.</p>
      </EditorContent>
      <SheetDivider style={{ margin: '4px 0 16px' }} />
      <DetailSection
        collapsible
        spacing="page"
        title="Tasks"
        count={<Badge variant="secondary">3</Badge>}
        action={
          <>
            <Button size="xs" variant="ghost" icon={Link}>
              Link Task
            </Button>
            <Button size="xs" icon={Plus}>
              New Task
            </Button>
          </>
        }
      >
        <TaskList
          selectionBar={false}
          tasks={[
            {
              id: '124',
              title: 'Implement OAuth2 PKCE flow',
              status: 'in-progress',
              key: 'ENG-124',
              subtasks: [3, 4],
              priority: 'high',
              date: 'Jun 24',
            },
            {
              id: '131',
              title: 'Refactor token refresh logic',
              status: 'in-progress',
              key: 'ENG-131',
              priority: 'high',
              date: 'Jun 18',
              dateTone: 'overdue',
            },
            {
              id: '118',
              title: 'Audit token storage',
              status: 'overdue',
              key: 'ENG-118',
              priority: 'high',
              date: 'Jun 19',
              dateTone: 'overdue',
            },
          ]}
        />
      </DetailSection>
    </NotePage>
  ),
};
