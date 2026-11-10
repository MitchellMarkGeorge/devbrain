import { shift, size } from '@floating-ui/dom';
import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useCallback, useId, type ReactElement, type Ref } from 'react';
import type { SuggestionMenuHandle } from '../../components';
import { setMenuAria } from '../extensions/editor-host';

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
  // the list's id and the callback for its highlighted item, which the editor's element names
  // for a screen reader; pass both to the menu
  id: string;
  onActiveDescendantChange: (id: string | undefined) => void;
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

interface MenuViewProps<T> extends Omit<
  MenuProps<T>,
  'handleRef' | 'id' | 'onActiveDescendantChange'
> {
  editor: Editor;
  render: (props: MenuProps<T>) => ReactElement;
}

export function createSuggestionMenu<T>(source: MenuSource<T>) {
  // ReactRenderer gives a forwardRef component its ref, which the menus take as handleRef
  const MenuView = forwardRef<SuggestionMenuHandle, MenuViewProps<T>>(function MenuView(
    { render, editor, ...props },
    ref,
  ) {
    const id = useId();
    const onActiveDescendantChange = useCallback(
      (activeId: string | undefined) => setMenuAria(editor, { listId: id, activeId }),
      [editor, id],
    );
    return render({ ...props, handleRef: ref, id, onActiveDescendantChange });
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
          // Fixed, kept 8px inside the window, and no taller than the room it has there: placed in
          // the page's flow (TipTap's default, absolute in the body), a menu below the fold made
          // the whole window taller and scroll. Its height reaches SlashMenu.module.css through a
          // variable, as the menu that scrolls is inside the mounted element.
          floatingUi: {
            strategy: 'fixed',
            middleware: [
              shift({ padding: 8 }),
              size({
                padding: 8,
                apply({ availableHeight, elements }) {
                  elements.floating.style.setProperty(
                    '--suggestion-max-height',
                    `${Math.max(120, Math.floor(availableHeight))}px`,
                  );
                },
              }),
            ],
          },
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
              editor: props.editor,
              render: source.render,
            });

            return {
              onStart(props) {
                renderer = new ReactRenderer(MenuView, {
                  editor: props.editor,
                  props: viewProps(props),
                });
                // out of the page's flow from the start: TipTap appends it to the body and only
                // positions it once its first position is worked out
                const element = renderer.element as HTMLElement;
                Object.assign(element.style, { position: 'fixed', top: '0', left: '0' });
                // inside the dialog or sheet the editor is in (a task note, the task sheet): over
                // it, and part of it, so picking an item isn't a press outside that closes it
                const surface = props.editor.view.dom.closest(
                  '[role="dialog"], [role="alertdialog"]',
                );
                (surface ?? document.body).appendChild(element);
                element.style.zIndex = '1';
                unmount = props.mount(element);
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
                // appended here rather than by TipTap's mount, so removed here too
                (renderer?.element as HTMLElement | undefined)?.remove();
                renderer?.destroy();
                renderer = null;
                unmount = null;
                source.onExit?.(props.editor);
                // after the plugin's own update, which this runs inside
                queueMicrotask(() => setMenuAria(props.editor, null));
              },
            };
          },
        }),
      ];
    },
  });
}
