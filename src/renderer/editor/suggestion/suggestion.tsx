import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, type ReactElement, type Ref } from 'react';
import type { SuggestionMenuHandle } from '../../components';

/**
 * A menu that opens when `char` is typed (the slash menu, "@" mentions): TipTap's Suggestion plugin
 * finds the query and positions the menu, and the design system's menu draws it (`SlashMenu`,
 * `MentionMenu`). The caret stays in the editor, which passes ↑, ↓, Enter and Tab to the menu
 * through `handleRef`.
 */
export interface MenuProps<T> {
  query: string;
  items: T[];
  onSelect: (item: T) => void;
  handleRef: Ref<SuggestionMenuHandle>;
}

export interface MenuSource<T> {
  name: string;
  char: string;
  // allows spaces in the query ("@fix login")
  allowSpaces?: boolean;
  items: (query: string, editor: Editor) => T[] | Promise<T[]>;
  select: (editor: Editor, range: Range, item: T) => void;
  render: (props: MenuProps<T>) => ReactElement;
  onExit?: (editor: Editor) => void;
}

interface MenuViewProps<T> extends Omit<MenuProps<T>, 'handleRef'> {
  render: (props: MenuProps<T>) => ReactElement;
}

export function createSuggestionMenu<T>(source: MenuSource<T>) {
  // ReactRenderer gives a forwardRef component its ref, which the menus take as handleRef
  const MenuView = forwardRef<SuggestionMenuHandle, MenuViewProps<T>>(function MenuView(
    { render, ...props },
    ref,
  ) {
    return render({ ...props, handleRef: ref });
  });

  return Extension.create({
    name: source.name,

    addProseMirrorPlugins() {
      return [
        Suggestion<T, T>({
          editor: this.editor,
          pluginKey: new PluginKey(source.name),
          char: source.char,
          allowSpaces: source.allowSpaces ?? false,
          debounce: 80,
          // never inside code, where "/" and "@" are just text
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query, editor }) => source.items(query, editor),
          command: ({ editor, range, props }) => source.select(editor, range, props),
          render: () => {
            let renderer: ReactRenderer<SuggestionMenuHandle, MenuViewProps<T>> | null = null;
            let unmount: (() => void) | null = null;

            const viewProps = (props: SuggestionProps<T, T>): MenuViewProps<T> => ({
              query: props.query,
              items: props.items,
              onSelect: (item) => props.command(item),
              render: source.render,
            });

            return {
              onStart(props) {
                renderer = new ReactRenderer(MenuView, {
                  editor: props.editor,
                  props: viewProps(props),
                });
                unmount = props.mount(renderer.element as HTMLElement);
              },
              onUpdate(props) {
                renderer?.updateProps(viewProps(props));
              },
              onKeyDown({ event }) {
                if (event.key === 'Escape') return false;
                return renderer?.ref?.onKeyDown(event) ?? false;
              },
              onExit(props) {
                unmount?.();
                renderer?.destroy();
                renderer = null;
                unmount = null;
                source.onExit?.(props.editor);
              },
            };
          },
        }),
      ];
    },
  });
}
