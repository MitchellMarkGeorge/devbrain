import { TaskItem } from '@tiptap/extension-list';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ReactRenderer } from '@tiptap/react';
import { Checkbox } from '@renderer/components';

interface ToDoCheckboxProps {
  checked: boolean;
  label: string;
  readOnly: boolean;
  onCheckedChange: (checked: boolean) => void;
}

// the design system's Checkbox, as a to-do's box
function ToDoCheckbox({ checked, label, readOnly, onCheckedChange }: ToDoCheckboxProps) {
  return (
    <Checkbox
      checked={checked}
      readOnly={readOnly}
      aria-label={label}
      onCheckedChange={onCheckedChange}
    />
  );
}

/**
 * Tiptap's task item, drawn with the design system's `Checkbox` (the editor's own uses a native
 * input). Its markdown and keys are TaskItem's: `- [ ]` and `- [x]`, Enter for the next to-do.
 *
 * The item is a plain node view, the list's own li holding a label with the Checkbox and then the
 * text, as EditorContent styles it, and only the Checkbox is React (a `ReactRenderer`). A React
 * node view (`ReactNodeViewRenderer`) with a `NodeViewContent` reads the page's selection as each
 * one mounts, and with no selection yet, as when a note opens, Chromium lays the whole page out
 * to answer: opening a note with 360 to-dos took over three seconds (docs/performance.md).
 */
export const TaskItemView = TaskItem.extend({
  addNodeView() {
    return ({ node, editor, getPos, HTMLAttributes }) => {
      let current: ProseMirrorNode = node;
      const item = document.createElement('li');
      const label = document.createElement('label');
      const content = document.createElement('div');
      // outside the editable text; pressing it keeps the editor's selection where it was, as
      // Tiptap's own checkbox does
      label.contentEditable = 'false';
      label.addEventListener('mousedown', (event) => event.preventDefault());
      for (const [name, value] of Object.entries(HTMLAttributes)) {
        if (value !== null && value !== undefined) item.setAttribute(name, String(value));
      }

      // ticking it sets the item's `checked`; a read-only note shows its to-dos as they are
      const setChecked = (checked: boolean) => {
        if (!editor.isEditable) return;
        const position = getPos();
        if (typeof position !== 'number') return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, checked }),
        );
      };
      const propsOf = (item: ProseMirrorNode): ToDoCheckboxProps => ({
        checked: item.attrs.checked === true,
        label: `To-do: ${item.textContent || 'empty'}`,
        readOnly: !editor.isEditable,
        onCheckedChange: setChecked,
      });
      const checkbox = new ReactRenderer(ToDoCheckbox, {
        editor,
        props: propsOf(node),
        as: 'span',
      });
      label.append(checkbox.element);
      item.append(label, content);
      // what EditorContent styles the item by
      item.dataset.type = 'taskItem';
      item.dataset.checked = String(node.attrs.checked === true);

      return {
        dom: item,
        contentDOM: content,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;
          item.dataset.checked = String(updated.attrs.checked === true);
          checkbox.updateProps(propsOf(updated));
          return true;
        },
        // the Checkbox's own events and redraws are its own, not edits to the text
        stopEvent: (event) => event.target instanceof Node && label.contains(event.target),
        ignoreMutation: (mutation) =>
          mutation.type !== 'selection' &&
          (label.contains(mutation.target) ||
            (mutation.target === item && mutation.type === 'attributes')),
        destroy: () => checkbox.destroy(),
      };
    };
  },
}).configure({ nested: true });
