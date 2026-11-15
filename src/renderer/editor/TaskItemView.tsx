import { TaskItem } from '@tiptap/extension-list';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { Checkbox } from '@renderer/components';

// a to-do as the design system's Checkbox, then its text; ticking it sets the item's `checked`
function TaskItemNodeView({ node, editor, updateAttributes }: ReactNodeViewProps) {
  const checked = node.attrs.checked === true;
  return (
    // the wrapper takes no box (EditorContent): the li lays out the checkbox and the text
    <NodeViewWrapper>
      {/*
       * outside the editable text; pressing it keeps the editor's selection where it was, as
       * Tiptap's own checkbox does
       */}
      <label contentEditable={false} onMouseDown={(event) => event.preventDefault()}>
        <Checkbox
          checked={checked}
          readOnly={!editor.isEditable}
          aria-label={`To-do: ${node.textContent || 'empty'}`}
          onCheckedChange={(next) => {
            // a read-only note shows its to-dos as they are
            if (editor.isEditable) updateAttributes({ checked: next });
          }}
        />
      </label>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

/**
 * Tiptap's task item, drawn with the design system's `Checkbox` (the editor's own uses a native
 * input). Its markdown and keys are TaskItem's: `- [ ]` and `- [x]`, Enter for the next to-do.
 */
export const TaskItemView = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TaskItemNodeView, {
      // the item itself is the list's li, carrying what EditorContent styles it by
      as: 'li',
      attrs: ({ node }) => ({
        'data-type': 'taskItem',
        'data-checked': String(node.attrs.checked === true),
      }),
    });
  },
}).configure({ nested: true });
