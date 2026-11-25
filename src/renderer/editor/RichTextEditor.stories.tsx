import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { useState } from 'react';
import { EditorEntityPill } from './EntityPillView';
import { RichTextEditor, type RichTextEditorProps } from './RichTextEditor';
import type { EditorEntity, EntityLinkPillProps } from './types';

/**
 * The working editor: type, press "/" for blocks and "@" to link, select text for the format
 * toolbar (⌘K for a link, Turn into task for a task). Beside it, the markdown it would save and what it asked the app to open.
 * The workspace is a stand-in: these entities, searched by title.
 */

const ENTITIES: EditorEntity[] = [
  {
    type: 'task',
    id: 'tsk_1',
    title: 'Implement OAuth2 PKCE flow',
    status: TaskStatus.IN_PROGRESS,
  },
  {
    type: 'task',
    id: 'tsk_2',
    title: 'Write PKCE migration guide',
    status: TaskStatus.NOT_STARTED,
  },
  { type: 'task', id: 'tsk_3', title: 'Rotate the signing keys', status: TaskStatus.COMPLETED },
  { type: 'project', id: 'prj_1', title: 'Auth rewrite', color: '#3b82f6' },
  { type: 'note', id: 'nte_1', title: 'Auth0 call notes' },
  { type: 'event', id: 'evt_1', title: 'Security review', color: '#ec4899' },
];

const NOTE = `# OAuth2 with PKCE

Part of [Auth rewrite](devbrain://project/prj_1), agreed in [Security review](devbrain://event/evt_1). Tracked in [Implement OAuth2 PKCE flow](devbrain://task/tsk_1).

## Generating the challenge

The client never holds a secret: each login proves it started the flow with a one-time **code verifier**. Press <kbd>⌘</kbd> <kbd>K</kbd> to search the [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636) notes.

\`\`\`ts
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
\`\`\`

> [!WARNING]
> Never store the code verifier anywhere it can outlive the login flow.

## Open items

- [x] Confirm S256 support with the Auth0 team
- [ ] Decide where the verifier lives during the redirect
- [ ] Document the mobile fallback for older Android WebViews

| Client  | Flow           | Status  |
| ------- | -------------- | ------- |
| Desktop | PKCE           | Done    |
| Mobile  | PKCE + WebView | Open    |

<details>
<summary>Why not the implicit flow?</summary>

Tokens in the redirect URL end up in browser history and logs; PKCE keeps them out of the URL.

</details>

H<sub>2</sub>O, x<sup>2</sup> and <u>underlined</u> text round off the supported tags.`;

const UNTRUSTED = `A synced description, as Google or Linear sent it.

Inline <span style="color:red">HTML</span> and <img src=x onerror=alert(1)> stay as text.

<div align="center">
<b>Centred block</b>
</div>

![tracking pixel](https://tracker.example/pixel.png "Tracking pixel")

[A script link](javascript:alert(1)) draws as text, and [a web link](https://example.com) opens through the app.`;

// a plain lookup in place of the app's React Query: an id it doesn't hold is gone
function StoryEntityPill(props: EntityLinkPillProps) {
  const entity = ENTITIES.find((entry) => entry.type === props.type && entry.id === props.id);
  return <EditorEntityPill {...props} entity={entity ?? null} />;
}

const host: Pick<RichTextEditorProps, 'searchEntities' | 'createTask' | 'entityPill'> = {
  async searchEntities(query, types) {
    const q = query.toLowerCase();
    return ENTITIES.filter(
      (entity) =>
        (types as string[]).includes(entity.type) && entity.title.toLowerCase().includes(q),
    );
  },
  // Turn into task: a task held only by the story, so its pill finds it
  async createTask(title) {
    const task: EditorEntity = {
      type: 'task',
      id: `tsk_story${ENTITIES.length}`,
      title,
      status: TaskStatus.NOT_STARTED,
    };
    ENTITIES.push(task);
    return task;
  },
  entityPill: StoryEntityPill,
};

const panel = {
  margin: 0,
  padding: 'var(--space-3) var(--space-4)',
  border: '1px solid var(--edge)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--card)',
  color: 'var(--muted-foreground)',
  font: '12px / 18px var(--font-mono)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
} as const;

const heading = {
  margin: '0 0 var(--space-2)',
  color: 'var(--muted-foreground)',
  font: 'var(--font-weight-medium) var(--text-xs) / var(--text-xs-leading) var(--font-sans)',
} as const;

interface PlaygroundProps {
  initial: string;
  editable?: boolean;
  label?: string;
}

// the editor with what it saves and what it opened beside it
function Playground({ initial, editable = true, label = 'Note' }: PlaygroundProps) {
  const [value, setValue] = useState(initial);
  const [saves, setSaves] = useState(0);
  const [opened, setOpened] = useState<string[]>([]);
  const log = (entry: string) => setOpened((list) => [entry, ...list].slice(0, 5));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, var(--content-max-width)) minmax(240px, 360px)',
        gap: 'var(--space-8)',
        alignItems: 'start',
      }}
    >
      <RichTextEditor
        {...host}
        label={label}
        initialValue={initial}
        editable={editable}
        onChange={(markdown) => {
          setValue(markdown);
          setSaves((count) => count + 1);
        }}
        onOpenEntity={(type, id) => log(`${type} ${id}`)}
        onOpenUrl={(url) => log(url)}
        openNewTask={(title) => log(`New task${title ? `: ${title}` : ''}`)}
      />
      <aside style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <section>
          <h2 style={heading}>Saved markdown · {saves === 0 ? 'unchanged' : `${saves} edits`}</h2>
          <pre style={panel}>{value || ' '}</pre>
        </section>
        <section>
          <h2 style={heading}>Opened</h2>
          <pre style={panel}>{opened.length ? opened.join('\n') : 'Nothing yet'}</pre>
        </section>
      </aside>
    </div>
  );
}

const meta = {
  title: 'Editor/RichTextEditor',
  component: Playground,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Playground>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A note with every element: pills, code, a callout, a to-do list, a table, a collapsible section,
 * keys
 */
export const Note: Story = { args: { initial: NOTE } };

/** A new note: the placeholder; "/" opens the slash menu, "@" searches the stand-in workspace */
export const Empty: Story = { args: { initial: '' } };

/**
 * A synced description, read-only: no toolbar or menus, and links and pills open on a plain click
 * (while editing, a link opens on ⌘/Ctrl-click)
 */
export const ReadOnly: Story = {
  args: {
    initial:
      'Synced from Linear. Blocked on [Rotate the signing keys](devbrain://task/tsk_3); see [the RFC](https://www.rfc-editor.org/rfc/rfc7636).',
    editable: false,
    label: 'Description',
  },
};

/**
 * What arrives from outside, kept in the file but inert: HTML shown as its source, an image as a
 * pill that is never loaded, and a script link as plain text
 */
export const UntrustedContent: Story = {
  args: { initial: UNTRUSTED, editable: false, label: 'Description' },
};

const TABLE_NOTE = [
  '# Tasks API v2 migration',
  '',
  'Endpoints the desktop client still calls, measured on staging.',
  '',
  '| Endpoint      | Method | Auth  | p95 (ms) |',
  '| ------------- | ------ | ----- | ---: |',
  '| /v2/tasks     | GET    | Token | 84       |',
  '| /v2/tasks/:id | PATCH  | Token | 112      |',
  '| /v2/sync      | POST   | OAuth | 340      |',
  '| /v2/health    | GET    | None  | 9        |',
  '',
  'p95 is the last 24 hours. Sync is the one to watch before the cut-over.',
].join('\n');

/**
 * A table to work in: point at a column or row for its handle (click for its menu, drag to move
 * it), near the line between two for a +, and at the bars under and beside it to add one. The bar
 * over its corner turns the header row off, copies its Markdown and deletes it; dragging across
 * cells gives a bar to align, clear or delete them. "/table" picks a size.
 */
export const Table: Story = { args: { initial: TABLE_NOTE } };
