import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { CodeBlock } from '@renderer/components';
import { CODE_LANGUAGES, languageLabel, languageValue } from './code-languages';
import { DocumentCodeBlock } from './markdown';

// a code block as the design system's CodeBlock; while editing, its label picks the language
function CodeBlockNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? null;
  return (
    <NodeViewWrapper>
      <CodeBlock
        languageLabel={languageLabel(language)}
        language={languageValue(language)}
        languages={CODE_LANGUAGES}
        onLanguageChange={
          editor.isEditable ? (value) => updateAttributes({ language: value || null }) : undefined
        }
      >
        <NodeViewContent<'code'> as="code" />
      </CodeBlock>
    </NodeViewWrapper>
  );
}

export const CodeBlockView = DocumentCodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});
