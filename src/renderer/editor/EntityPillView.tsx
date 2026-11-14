import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { EntityPill } from '@renderer/components';
import { EntityLink } from './extensions/entity-link';
import { ImageLink } from './extensions/image-link';
import type { EditorEntityType, EditorHost } from './types';
import styles from './EntityPillView.module.css';

// the host of the editor a pill is in; RichTextEditor provides it
export const EditorHostContext = createContext<EditorHost>({});

/**
 * An entity link as the design system's EntityPill: the entity's glyph and its current title, the
 * stored label while the host cannot resolve it. A click opens the entity.
 */
function EntityLinkPill({ node, selected }: ReactNodeViewProps) {
  const host = useContext(EditorHostContext);
  const type = node.attrs.type as EditorEntityType;
  const id = node.attrs.id as string;
  const { resolveEntity, watchEntity } = host;
  const subscribe = useCallback(
    (onChange: () => void) => watchEntity?.(type, id, onChange) ?? (() => {}),
    [watchEntity, type, id],
  );
  // what the pill draws, as a string, so a resolver that builds a new object per call still
  // gives the store an unchanged snapshot while the entity is unchanged
  const snapshot = () => {
    const found = resolveEntity?.(type, id);
    return found
      ? `${found.title}\u0000${found.status ?? ''}\u0000${found.color ?? ''}`
      : String(found);
  };
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const entity = resolveEntity?.(type, id);
  const title = entity?.title ?? node.attrs.label;
  // gone: known to be (null), or unknown to a host that can't watch for it to load
  const missing = entity === null || (resolveEntity && !watchEntity && entity === undefined);

  return (
    <NodeViewWrapper
      as="span"
      className={styles.inline}
      data-selected={selected ? '' : undefined}
      data-missing={missing ? '' : undefined}
      data-entity-type={type}
    >
      <EntityPill
        entity={
          type === 'task'
            ? { type, title, status: entity?.status ?? TaskStatus.NOT_STARTED }
            : type === 'note'
              ? { type, title }
              : { type, title, color: entity?.color ?? null }
        }
        // the caret moves past it; Tab stays with the editor
        tabIndex={-1}
        onClick={() => host.onOpenEntity?.(type, id)}
      />
    </NodeViewWrapper>
  );
}

// a markdown image as a pill with its alt text, never the image (see image-link.ts); a click
// opens it through the editor's link handling
function ImagePill({ node, selected }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as="span"
      className={styles.inline}
      data-selected={selected ? '' : undefined}
      data-image-src={node.attrs.src}
      title={node.attrs.title ?? node.attrs.src}
    >
      <EntityPill glyph={ImageIcon} tabIndex={-1}>
        {node.attrs.alt || node.attrs.src}
      </EntityPill>
    </NodeViewWrapper>
  );
}

export const EntityLinkView = EntityLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EntityLinkPill, { as: 'span' });
  },
});

export const ImageLinkView = ImageLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImagePill, { as: 'span' });
  },
});
