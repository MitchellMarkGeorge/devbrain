import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { Callout as CalloutBlock, type CalloutKind } from '@renderer/components';
import { Callout } from './extensions/callout';

// a callout as the design system's Callout; while editing, its title changes the kind
function CalloutNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper>
      <CalloutBlock
        kind={node.attrs.kind as CalloutKind}
        onKindChange={editor.isEditable ? (kind) => updateAttributes({ kind }) : undefined}
      >
        <NodeViewContent data-callout-body="" />
      </CalloutBlock>
    </NodeViewWrapper>
  );
}

export const CalloutView = Callout.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },
});
