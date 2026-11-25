import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { CircleCheck, Link, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { MentionsPill } from '../../detail/MentionsSection';
import { PillPopover } from '../../detail/PillPopover';
import { EditorContent } from '../../editor/EditorContent';
import { EntityPill } from '../../entities/EntityPill';
import { LinkedTaskRow, type LinkedTaskRowData } from '../../lists/LinkedTaskRow';
import { SAMPLE_MENTIONS } from '../../lists/MentionRow/fixtures';
import { sampleLinear } from '../../lists/TaskRow/fixtures';
import { NotePage } from './notePage';
import { storyDate } from '../../lib/story-dates';

const meta = {
  title: 'Screens/Notes',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// the tasks made from the note, from Linear
const NOTE_TASKS: LinkedTaskRowData[] = [
  {
    title: 'Implement OAuth2 PKCE flow',
    status: TaskStatus.IN_PROGRESS,
    dueDate: storyDate(2),
    external: sampleLinear('ENG-124'),
  },
  {
    title: 'Refactor token refresh logic',
    status: TaskStatus.IN_PROGRESS,
    dueDate: storyDate(-4),
    external: sampleLinear('ENG-131'),
  },
  {
    title: 'Audit token storage',
    status: TaskStatus.NOT_STARTED,
    dueDate: storyDate(-3),
    external: sampleLinear('ENG-118'),
  },
];

/**
 * Note editor (linked tasks) (7158:16863, as built): the note, its tasks and what mentions it as
 * pills under the title, the tasks open in their popover
 */
export const NoteEditorLinkedTasks: Story = {
  name: 'Note editor (linked tasks)',
  render: () => (
    <NotePage
      title="Architecture ADR #4 — PKCE"
      edited="Edited yesterday"
      pills={
        <>
          <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
          <PillPopover
            glyph={CircleCheck}
            label="3 tasks · 2 in progress"
            heading="Tasks"
            defaultOpen
            action={
              <>
                <Button size="xs" variant="ghost" icon={Link}>
                  Link
                </Button>
                <Button size="xs" variant="ghost" icon={Plus}>
                  New
                </Button>
              </>
            }
          >
            <div>
              {NOTE_TASKS.map((task) => (
                <LinkedTaskRow key={task.title} task={task} onOpen={() => {}} />
              ))}
            </div>
          </PillPopover>
          <MentionsPill mentions={SAMPLE_MENTIONS.slice(2, 6)} />
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
    </NotePage>
  ),
};
