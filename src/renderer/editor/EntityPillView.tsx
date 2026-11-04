import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { createContext, useContext } from 'react';
import { EntityIcon } from './EntityIcon';
import { EntityLink } from './extensions/entity-link';
import { ImageLink } from './extensions/image-link';
import type { EditorEntityType, EditorHost } from './types';
import styles from './EntityPill.module.css';

// the host of the editor a pill is in; RichTextEditor provides it
export const EditorHostContext = createContext<EditorHost>({});

/**
 * An entity link as the design system's EntityPill: the entity's glyph and its current title in
 * `muted-foreground`, outlined on the page colour. A click opens the entity.
 */
function EntityPill({ node, selected }: ReactNodeViewProps) {
  const host = useContext(EditorHostContext);
  const type = node.attrs.type as EditorEntityType;
  const id = node.attrs.id as string;
  const entity = host.resolveEntity?.(type, id);
  const title = entity?.title ?? node.attrs.label;

  return (
    <NodeViewWrapper
      as="span"
      className={styles.pill}
      data-selected={selected ? '' : undefined}
      data-missing={host.resolveEntity && !entity ? '' : undefined}
      data-entity-type={type}
      role="link"
      title={title}
      onClick={() => host.onOpenEntity?.(type, id)}
    >
      <span className={styles.icon}>
        <EntityIcon entity={entity ?? { type }} />
      </span>
      <span className={styles.label}>{title}</span>
    </NodeViewWrapper>
  );
}

// a markdown image as a link chip: its alt text, never the image (see image-link.ts)
function ImageChip({ node, selected }: ReactNodeViewProps) {
  const label = node.attrs.alt || node.attrs.src;
  return (
    <NodeViewWrapper
      as="span"
      className={styles.pill}
      data-selected={selected ? '' : undefined}
      data-image-src={node.attrs.src}
      title={node.attrs.title ?? node.attrs.src}
    >
      <span className={styles.label}>{label}</span>
    </NodeViewWrapper>
  );
}

export const EntityLinkView = EntityLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EntityPill, { as: 'span' });
  },
});

export const ImageLinkView = ImageLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageChip, { as: 'span' });
  },
});
