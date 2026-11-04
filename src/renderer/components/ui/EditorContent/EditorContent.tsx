import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import styles from './EditorContent.module.css';

/**
 * The look of a note's blocks, for whichever editor library renders them: wrap the editor's
 * content element in it (or pass `editorContentClassName` to the library). It styles the HTML the
 * common editors emit:
 *
 * - `p`, `h1`–`h3`, `ul`, `ol`, `hr`, `a`, `strong`, `em`, `u`, `s`, inline `code`, `mark`
 * - to-dos: `ul[data-type='taskList'] > li[data-checked]` with a `label > input[type=checkbox]`
 *   then a `div` (Tiptap's markup), checked ones struck through in `muted-foreground`
 * - code blocks: `pre[data-language]` (the language shows as a label) around `code`
 * - quotes: `blockquote`, a 2px bar on the left
 * - the selection: `::selection`, or a `span[data-selection]` for pictures
 * - placeholders: an empty block with `data-placeholder` shows it ("Press / for commands…"),
 *   on `.is-empty` (Tiptap) or `:empty`
 */
export const EditorContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function EditorContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.content, className)} {...props} />;
  },
);

/** The class `EditorContent` puts on its element, for a library that takes a class name. */
export const editorContentClassName = styles.content;

export interface EditorTitleProps extends ComponentPropsWithoutRef<'h1'> {
  /** shown while the title is empty: "Untitled" */
  placeholder?: string;
}

/**
 * A note's title over its content: the 24px semibold document title, "Untitled" in
 * `subtle-foreground` while it is empty. Make it `contentEditable` or render an input through it.
 */
export const EditorTitle = forwardRef<HTMLHeadingElement, EditorTitleProps>(function EditorTitle(
  { placeholder = 'Untitled', className, ...props },
  ref,
) {
  return (
    <h1
      ref={ref}
      data-placeholder={placeholder}
      className={cn(styles.title, className)}
      {...props}
    />
  );
});
