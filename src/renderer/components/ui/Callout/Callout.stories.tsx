import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EditorContent } from '../EditorContent';
import { CALLOUT_KINDS, Callout, type CalloutKind } from './Callout';

const meta = {
  title: 'Editor/Callout',
  component: Callout,
  args: { kind: 'warning', children: <p>The migration rewrites every row; run it off-hours.</p> },
  decorators: [
    (Story) => (
      <EditorContent style={{ maxWidth: 720 }}>
        <Story />
      </EditorContent>
    ),
  ],
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const BODIES: Record<CalloutKind, string> = {
  note: 'Useful information worth noticing, even when skimming.',
  tip: 'Run npm run tokens after editing tokens.json.',
  important: 'The verifier must never outlive the login flow.',
  warning: 'The migration rewrites every row; run it off-hours.',
  caution: 'Rotating the keys signs every user out.',
};

/** Every kind: Note, Tip, Important, Warning, Caution */
export const Kinds: Story = {
  render: () => (
    <>
      {CALLOUT_KINDS.map(({ kind }) => (
        <Callout key={kind} kind={kind}>
          <p>{BODIES[kind]}</p>
        </Callout>
      ))}
    </>
  ),
};

/** In the editor: the title opens a menu of the kinds */
export const ChangeKind: Story = {
  render: function Render() {
    const [kind, setKind] = useState<CalloutKind>('note');
    return (
      <Callout kind={kind} onKindChange={setKind}>
        <p>{BODIES[kind]}</p>
      </Callout>
    );
  },
};

/** Between paragraphs of a note */
export const InANote: Story = {
  render: () => (
    <>
      <p>Ship behind a flag first.</p>
      <Callout kind="warning">
        <p>The migration rewrites every row; run it off-hours.</p>
      </Callout>
      <p>Then turn it on for desktop, and mobile a week later.</p>
    </>
  ),
};
