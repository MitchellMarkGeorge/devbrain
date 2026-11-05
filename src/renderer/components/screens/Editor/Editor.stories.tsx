import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus } from 'lucide-react';
import { ColourMenu, editorTextColour, type EditorColour } from '../../editor/ColourMenu';
import { EditorContent } from '../../editor/EditorContent';
import { EntityPill } from '../../entities/EntityPill';
import { FormatToolbar, type FormatMark } from '../../editor/FormatToolbar';
import { SlashMenu } from '../../editor/SlashMenu';
import type { SuggestionMenuHandle } from '../../editor/SlashMenu';
import { TurnIntoMenu, type BlockType } from '../../editor/TurnIntoMenu';
import { NotePage } from '../Notes/notePage';

const meta = {
  title: 'Screens/Editor',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PILLS = (
  <>
    <EntityPill glyph={Plus}>Add to project</EntityPill>
    <EntityPill glyph={Plus}>Add task</EntityPill>
  </>
);

const INTRO = (
  <p>
    We need a hosted identity provider before the PKCE rollout. Three candidates made the shortlist,
    each scored on cost, SSO support, SDK quality and migration effort.
  </p>
);

/** Editor — slash menu (7175:38889): "/" typed on an empty line, the menu under it */
export const SlashMenuOpen: Story = {
  name: 'Editor — slash menu',
  render: function Render() {
    const [query, setQuery] = useState('');
    const menu = useRef<SuggestionMenuHandle>(null);
    return (
      <NotePage title="Auth provider eval matrix" edited="Edited Jun 19" pills={PILLS}>
        <EditorContent>
          {INTRO}
          <p style={{ display: 'flex' }}>
            /
            <input
              autoFocus
              value={query}
              placeholder="Filter…"
              aria-label="Filter blocks"
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => menu.current?.onKeyDown(e) && e.preventDefault()}
              style={{
                flex: 1,
                padding: 0,
                border: 0,
                background: 'none',
                color: 'inherit',
                font: 'inherit',
                outline: 'none',
              }}
            />
          </p>
          <h2>Shortlist</h2>
          <ul>
            <li>
              Auth0: the fastest to integrate and the best SDKs, but the highest cost per active
              user.
            </li>
            <li>
              Cognito: the cheapest at our scale, with weaker SSO and a rougher admin console.
            </li>
            <li>Keycloak: full control, at the cost of running it ourselves.</li>
          </ul>
          <p>
            Recommendation: start a two-week Auth0 trial and revisit cost once real usage numbers
            are in.
          </p>
        </EditorContent>
        <SlashMenu
          query={query}
          handleRef={menu}
          style={{ position: 'absolute', left: -4, top: 200 }}
        />
      </NotePage>
    );
  },
};

/** Editor — slash menu filtered (7175:39275): "/h" narrows it to the headings */
export const SlashMenuFiltered: Story = {
  name: 'Editor — slash menu filtered',
  render: () => (
    <NotePage title="Auth provider eval matrix" edited="Edited Jun 19" pills={PILLS}>
      <EditorContent>
        {INTRO}
        <p>/h</p>
      </EditorContent>
      <SlashMenu query="h" style={{ position: 'absolute', left: -4, top: 200 }} />
    </NotePage>
  ),
};

/** Editor — selection toolbar (7175:37796): a selection with Bold pressed */
export const SelectionToolbar: Story = {
  name: 'Editor — selection toolbar',
  render: function Render() {
    const [marks, setMarks] = useState<Partial<Record<FormatMark, boolean>>>({ bold: true });
    const [block, setBlock] = useState<BlockType>('text');
    const [colour, setColour] = useState<EditorColour>('blue');
    const [highlight, setHighlight] = useState<EditorColour>('default');
    return (
      <NotePage title="Auth provider eval matrix" edited="Edited Jun 19" pills={PILLS}>
        <EditorContent>
          {INTRO}
          <h2>Shortlist</h2>
          <ul>
            <li>
              Auth0: the fastest to integrate and the best SDKs, but the highest cost per active
              user.
            </li>
            <li>
              Cognito: the cheapest at our scale, with weaker SSO and a rougher admin console.
            </li>
            <li>Keycloak: full control, at the cost of running it ourselves.</li>
          </ul>
          <p>
            Recommendation: start a <span data-selection="">two-week Auth0 trial</span> and revisit
            cost once real usage numbers are in.
          </p>
        </EditorContent>
        <FormatToolbar
          style={{ position: 'absolute', left: 70, top: 262 }}
          blockType="Text"
          marks={marks}
          onMarkChange={(mark, pressed) => setMarks((m) => ({ ...m, [mark]: pressed }))}
          colour={colour === 'default' ? undefined : editorTextColour(colour)}
          turnIntoMenu={
            <TurnIntoMenu value={block} onValueChange={setBlock} onTurnIntoTask={() => undefined} />
          }
          colourMenu={
            <ColourMenu
              textColour={colour}
              onTextColourChange={setColour}
              highlight={highlight}
              onHighlightChange={setHighlight}
            />
          }
        />
      </NotePage>
    );
  },
};
