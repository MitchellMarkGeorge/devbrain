import type { Meta, StoryObj } from '@storybook/react-vite';
import { kbdVariants } from '../../ui/Kbd';
import { EditorContent, EditorTitle } from './EditorContent';

const meta = {
  title: 'Editor/EditorContent',
  component: EditorContent,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EditorContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Editor — block styles (7175:41353): paragraph, heading, code, quote, to-dos */
export const BlockStyles: Story = {
  render: () => (
    <EditorContent>
      <p>
        Mobile and desktop clients move to the authorization code flow with PKCE. The client never
        holds a secret: each login proves it started the flow with a one-time code verifier.
      </p>
      <h2>Generating the challenge</h2>
      <pre data-language="TypeScript">
        <code>{`import { randomBytes, createHash } from 'node:crypto';

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');`}</code>
      </pre>
      <blockquote>Never store the code verifier anywhere it can outlive the login flow.</blockquote>
      <h2>Open items</h2>
      <ul data-type="taskList">
        {[
          ['Confirm S256 support with the Auth0 team', true],
          ['Decide where the verifier lives during the redirect', true],
          ['Document the mobile fallback for older Android WebViews', false],
          ['Link this note from Architecture ADR #4', false],
        ].map(([text, done]) => (
          <li key={text as string} data-checked={String(done)}>
            <label>
              <input type="checkbox" defaultChecked={done as boolean} aria-label={text as string} />
            </label>
            <div>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </EditorContent>
  ),
};

/** Tables, a collapsible section, keys, sub- and superscript, and HTML shown as its source */
export const TablesAndSections: Story = {
  render: () => (
    <EditorContent>
      <p>
        Press <kbd className={kbdVariants()}>⌘K</kbd> to search. H<sub>2</sub>O, x<sup>2</sup> and{' '}
        <u>underlined</u> text.
      </p>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Owner</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Schema</td>
            <td>Sam</td>
            <td>Done</td>
          </tr>
          <tr>
            <td>Backfill</td>
            <td>Jo</td>
            <td>Open</td>
          </tr>
        </tbody>
      </table>
      <div data-type="details" className="is-open">
        <button type="button" aria-label="Close section" />
        <div>
          <summary>Setup steps</summary>
          <div data-type="detailsContent">
            <ul>
              <li>
                <p>
                  Install with <code>npm ci</code>
                </p>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div data-type="details">
        <button type="button" aria-label="Open section" />
        <div>
          <summary>Closed section</summary>
          <div data-type="detailsContent" hidden>
            <p>Hidden body</p>
          </div>
        </div>
      </div>
      <p>
        Other HTML like <code data-raw-html="">{'<span>'}</code>this
        <code data-raw-html="">{'</span>'}</code> stays as text.
      </p>
    </EditorContent>
  ),
};

/** Headings, lists, marks and links */
export const Text: Story = {
  render: () => (
    <EditorContent>
      <h1>Heading 1</h1>
      <h2>Heading 2</h2>
      <h3>Heading 3</h3>
      <p>
        Body text with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s>,{' '}
        <code>inline code</code>, a <a href="#">link</a>, a <mark>highlight</mark> and a{' '}
        <span data-selection="">selection</span>.
      </p>
      <ul>
        <li>Bulleted item</li>
        <li>Another item</li>
      </ul>
      <ol>
        <li>Numbered item</li>
        <li>Another item</li>
      </ol>
      <hr />
      <p>After the divider.</p>
    </EditorContent>
  ),
};

/** Editor — new empty note (7175:41157): the title and block placeholders */
export const Placeholders: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <EditorTitle />
      <EditorContent>
        <p data-placeholder="Start writing, or press / for commands…" />
        <p data-placeholder="Press / for commands…" />
        <h2 data-placeholder="Heading 2" />
      </EditorContent>
    </div>
  ),
};
