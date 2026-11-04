import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EditorContent } from '../EditorContent';
import { CodeBlock, type CodeLanguage } from './CodeBlock';

const LANGUAGES: CodeLanguage[] = [
  { value: '', label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
];

// TypeScript as highlight.js marks it up, with every syntax role
const TYPESCRIPT = (
  <code>
    <span className="hljs-keyword">import</span> {'{ '}
    <span className="hljs-title class_">SyncQueue</span>
    {' } '}
    <span className="hljs-keyword">from</span>{' '}
    <span className="hljs-string">&apos;./sync&apos;</span>;{'\n\n'}
    <span className="hljs-comment">{'// retries with backoff, at most five times'}</span>
    {'\n'}
    <span className="hljs-keyword">export</span> <span className="hljs-keyword">async</span>{' '}
    <span className="hljs-keyword">function</span>{' '}
    <span className="hljs-title function_">drain</span>(
    <span className="hljs-params">queue: SyncQueue</span>):{' '}
    <span className="hljs-title class_">Promise</span>&lt;
    <span className="hljs-built_in">number</span>
    &gt; {'{\n  '}
    <span className="hljs-keyword">const</span> <span className="hljs-variable">limit</span> ={' '}
    <span className="hljs-number">5</span>;{'\n  '}
    <span className="hljs-keyword">return</span> queue.<span className="hljs-property">size</span>{' '}
    &gt; <span className="hljs-number">0</span> ? limit : <span className="hljs-literal">null</span>
    ;{'\n}'}
  </code>
);

const meta = {
  title: 'Editor/CodeBlock',
  component: CodeBlock,
  args: { languageLabel: 'TypeScript', language: 'typescript', children: TYPESCRIPT },
  decorators: [
    (Story) => (
      <EditorContent style={{ maxWidth: 720 }}>
        <Story />
      </EditorContent>
    ),
  ],
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Highlighted TypeScript: keywords, strings, numbers, comments, functions, types, properties */
export const Highlighted: Story = {};

/** No language: plain text, never guessed */
export const PlainText: Story = {
  args: {
    languageLabel: 'Plain text',
    language: '',
    children: <code>{'GET /api/tasks?status=open\nAuthorization: Bearer …'}</code>,
  },
};

/** In the editor: the label opens a searchable menu of the languages */
export const ChooseLanguage: Story = {
  render: function Render() {
    const [language, setLanguage] = useState('typescript');
    const label = LANGUAGES.find((item) => item.value === language)?.label ?? 'Plain text';
    return (
      <CodeBlock
        languageLabel={label}
        language={language}
        languages={LANGUAGES}
        onLanguageChange={setLanguage}
      >
        {TYPESCRIPT}
      </CodeBlock>
    );
  },
};
