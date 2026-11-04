import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import {
  SuggestionMenu,
  type SuggestionItem,
  type SuggestionMenuHandle,
  type SuggestionMenuProps,
} from './SuggestionMenu';

/**
 * A menu that opens when `char` is typed (the slash menu, "@" links): TipTap's Suggestion plugin
 * finds the query and positions the menu; SuggestionMenu draws it. Each use gives the items for a
 * query and what choosing one does.
 */
export interface MenuSource<T extends SuggestionItem> {
  name: string;
  char: string;
  emptyLabel: string;
  // allows spaces in the query ("@fix login")
  allowSpaces?: boolean;
  items: (query: string, editor: Editor) => T[] | Promise<T[]>;
  select: (editor: Editor, range: Range, item: T) => void;
}

let menuCount = 0;

export function createSuggestionMenu<T extends SuggestionItem>(source: MenuSource<T>) {
  return Extension.create({
    name: source.name,

    addProseMirrorPlugins() {
      const options: Omit<SuggestionOptions<T, T>, 'editor'> = {
        pluginKey: new PluginKey(source.name),
        char: source.char,
        allowSpaces: source.allowSpaces ?? false,
        debounce: 80,
        // never inside code, where "/" and "@" are just text
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query, editor }) => source.items(query, editor),
        command: ({ editor, range, props }) => source.select(editor, range, props),
        render: () => {
          let renderer: ReactRenderer<SuggestionMenuHandle, SuggestionMenuProps> | null = null;
          let unmount: (() => void) | null = null;
          const id = `suggestion-menu-${++menuCount}`;

          const menuProps = (props: SuggestionProps<T, T>): SuggestionMenuProps => ({
            id,
            items: props.items,
            loading: props.loading,
            emptyLabel: source.emptyLabel,
            onSelect: (item) => props.command(item as T),
          });

          return {
            onStart(props) {
              renderer = new ReactRenderer(SuggestionMenu, {
                editor: props.editor,
                props: menuProps(props),
              });
              unmount = props.mount(renderer.element as HTMLElement);
              props.editor.view.dom.setAttribute('aria-controls', id);
            },
            onUpdate(props) {
              renderer?.updateProps(menuProps(props));
            },
            onKeyDown({ event }) {
              if (event.key === 'Escape') return false;
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit(props) {
              props.editor.view.dom.removeAttribute('aria-controls');
              unmount?.();
              renderer?.destroy();
              renderer = null;
              unmount = null;
            },
          };
        },
      };
      return [Suggestion<T, T>({ editor: this.editor, ...options })];
    },
  });
}
