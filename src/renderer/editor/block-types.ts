import type { Editor } from '@tiptap/core';
import type { BlockType } from '../components';

/**
 * The block types of the design system's TurnIntoMenu and SlashMenu (`BLOCK_TYPES`), in the editor:
 * which one the caret is in, and turning the current block into one. Both menus use these, so a
 * block becomes the same thing from either.
 */

type Chain = ReturnType<Editor['chain']>;

// the current block or blocks, unwrapped from lists and quotes first, then made the type
const APPLY: Record<BlockType, (chain: Chain) => Chain> = {
  text: (chain) => chain.clearNodes().setParagraph(),
  'heading-1': (chain) => chain.clearNodes().setHeading({ level: 1 }),
  'heading-2': (chain) => chain.clearNodes().setHeading({ level: 2 }),
  'heading-3': (chain) => chain.clearNodes().setHeading({ level: 3 }),
  'bulleted-list': (chain) => chain.clearNodes().toggleBulletList(),
  'numbered-list': (chain) => chain.clearNodes().toggleOrderedList(),
  'todo-list': (chain) => chain.clearNodes().toggleTaskList(),
  code: (chain) => chain.clearNodes().setCodeBlock(),
  quote: (chain) => chain.clearNodes().setBlockquote(),
};

export function applyBlockType(chain: Chain, type: BlockType): boolean {
  return APPLY[type](chain).run();
}

// the block type the caret is in: its list or quote first, then its own kind
export function currentBlockType(editor: Editor): BlockType {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    switch ($from.node(depth).type.name) {
      case 'taskList':
        return 'todo-list';
      case 'bulletList':
        return 'bulleted-list';
      case 'orderedList':
        return 'numbered-list';
      case 'blockquote':
        return 'quote';
    }
  }
  const block = $from.parent;
  if (block.type.name === 'codeBlock') return 'code';
  if (block.type.name === 'heading') {
    const level = block.attrs.level as number;
    if (level >= 1 && level <= 3) return `heading-${level}` as BlockType;
  }
  return 'text';
}
