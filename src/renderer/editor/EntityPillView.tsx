import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { createContext, useContext } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { EntityPill } from '@renderer/components';
import { EntityLink } from './extensions/entity-link';
import { ImageLink } from './extensions/image-link';
import type {
  EditorEntity,
  EditorEntityType,
  EditorHost,
  EntityLinkPill,
  EntityLinkPillProps,
} from './types';
import styles from './EntityPillView.module.css';

// the host of the editor a pill is in; RichTextEditor provides it
export const EditorHostContext = createContext<EditorHost>({});

export interface EditorEntityPillProps extends EntityLinkPillProps {
  // the entity as it is now: undefined while unknown, null when it is known to be gone (deleted,
  // or in the trash)
  entity: EditorEntity | null | undefined;
}

/**
 * An entity link as the design system's EntityPill: the entity's glyph and its current title, or
 * the stored label while it is unknown. One known to be gone keeps its label, drawn as missing. A
 * click opens the entity. RichTextEditor's `entityPill` finds the entity and draws it with this.
 */
export function EditorEntityPill({ type, id, label, entity }: EditorEntityPillProps) {
  const { onOpenEntity } = useContext(EditorHostContext);
  const title = entity?.title ?? label;
  return (
    <EntityPill
      entity={
        type === 'task'
          ? { type, title, status: entity?.status ?? TaskStatus.NOT_STARTED }
          : type === 'note'
            ? { type, title }
            : { type, title, color: entity?.color ?? null }
      }
      data-missing={entity === null ? '' : undefined}
      // the caret moves past it; Tab stays with the editor
      tabIndex={-1}
      onClick={() => onOpenEntity?.(type, id, entity ?? undefined)}
    />
  );
}

// without an entityPill, every pill shows its stored label
function StoredLabelPill(props: EntityLinkPillProps) {
  return <EditorEntityPill {...props} entity={undefined} />;
}

interface EntityLinkViewOptions {
  // draws each link; set once, when the editor is made (RichTextEditor's `entityPill`)
  pill: EntityLinkPill | undefined;
}

// an entity link in the text, drawn by its extension's pill. The pill re-renders itself when what
// it reads changes; this re-renders when the node does (its attributes, being selected).
function EntityLinkNodeView({ node, selected, extension }: ReactNodeViewProps) {
  const Pill = (extension.options as EntityLinkViewOptions).pill ?? StoredLabelPill;
  const type = node.attrs.type as EditorEntityType;
  return (
    <NodeViewWrapper
      as="span"
      className={styles.inline}
      data-selected={selected ? '' : undefined}
      data-entity-type={type}
    >
      <Pill type={type} id={node.attrs.id as string} label={node.attrs.label as string} />
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

export const EntityLinkView = EntityLink.extend<EntityLinkViewOptions>({
  addOptions() {
    return { pill: undefined };
  },
  addNodeView() {
    return ReactNodeViewRenderer(EntityLinkNodeView, { as: 'span' });
  },
});

export const ImageLinkView = ImageLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImagePill, { as: 'span' });
  },
});
