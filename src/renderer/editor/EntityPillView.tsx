import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { createContext, useContext } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { EntityPill } from '@renderer/components';
import { EntityLink } from './extensions/entity-link';
import { ImageLink } from './extensions/image-link';
import type { EditorEntityType, EditorHost } from './types';
import { useEditorEntity } from './use-entity-resolver';
import styles from './EntityPillView.module.css';

// the host of the editor a pill is in; RichTextEditor provides it
export const EditorHostContext = createContext<EditorHost>({});

/**
 * An entity link as the design system's EntityPill: the entity's glyph and its current title, read
 * from React Query (useEditorEntity), or the stored label until it has loaded. One known to be
 * gone (deleted, or in the trash) keeps its label, drawn as missing. A click opens the entity.
 */
function EntityLinkPill({ node, selected }: ReactNodeViewProps) {
  const { onOpenEntity } = useContext(EditorHostContext);
  const type = node.attrs.type as EditorEntityType;
  const id = node.attrs.id as string;
  const entity = useEditorEntity(type, id);
  const title = entity?.title ?? (node.attrs.label as string);

  return (
    <NodeViewWrapper
      as="span"
      className={styles.inline}
      data-selected={selected ? '' : undefined}
      data-missing={entity === null ? '' : undefined}
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
        onClick={() => onOpenEntity?.(type, id, entity ?? undefined)}
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
