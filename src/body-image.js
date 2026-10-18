import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';

export const escapeImageText = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function imageMarkdown(attrs) {
  return `<figure data-body-image="true"><img src="${escapeImageText(attrs.src)}" alt="${escapeImageText(attrs.alt)}">${attrs.caption ? `<figcaption>${escapeImageText(attrs.caption)}</figcaption>` : ''}</figure>`;
}

export const BodyImage = Image.extend({
  addOptions() { return { ...this.parent?.(), onEdit: () => {} }; },
  addAttributes() {
    const parent = this.parent?.() || {};
    for (const [name, attr] of Object.entries(parent)) parent[name] = { ...attr, parseHTML: el => (el.matches('figure') ? el.querySelector('img') : el)?.getAttribute(name) ?? attr.default };
    return { ...parent,
      caption: { default: '', parseHTML: el => el.closest('figure')?.querySelector('figcaption')?.textContent || '', rendered: false },
      originalSrc: { default: '', parseHTML: el => el.closest('figure')?.getAttribute('data-original-src') || '', rendered: false },
      crop: { default: '', parseHTML: el => el.closest('figure')?.getAttribute('data-image-crop') || '', rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: 'figure', getAttrs: el => el.querySelector('img') ? null : false }, ...(this.parent?.() || [])];
  },
  renderHTML({ node, HTMLAttributes }) {
    const attrs = { 'data-body-image': 'true', ...(node.attrs.originalSrc ? { 'data-original-src': node.attrs.originalSrc } : {}), ...(node.attrs.crop ? { 'data-image-crop': node.attrs.crop } : {}) };
    return ['figure', attrs, ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)], ...(node.attrs.caption ? [['figcaption', {}, node.attrs.caption]] : [])];
  },
  renderMarkdown: node => imageMarkdown(node.attrs),
  addNodeView() {
    const onEdit = this.options.onEdit;
    return ({ node, editor, getPos }) => {
      let current = node;
      const figure = document.createElement('figure');figure.className = 'body-image';figure.contentEditable = 'false';
      const media = document.createElement('div');media.className = 'body-image-media';
      const image = document.createElement('img');image.draggable = false;
      const edit = document.createElement('button');edit.type = 'button';edit.className = 'body-image-edit';edit.textContent = 'Editar';edit.setAttribute('aria-label', 'Editar imagen');
      const remove = document.createElement('button');remove.type = 'button';remove.className = 'body-image-remove';remove.textContent = '×';remove.setAttribute('aria-label', 'Quitar imagen');
      const caption = document.createElement('button');caption.type = 'button';caption.className = 'body-image-caption';caption.setAttribute('aria-label', 'Editar pie de imagen');
      media.append(image, edit, remove);figure.append(media, caption);
      const select = () => { const pos = getPos();if (typeof pos === 'number') editor.commands.setNodeSelection(pos);return pos; };
      edit.onclick = event => { event.preventDefault();event.stopPropagation();select();onEdit(editor, getPos, 'crop'); };
      caption.onclick = event => { event.preventDefault();event.stopPropagation();select();onEdit(editor, getPos, 'caption'); };
      remove.onclick = event => { event.preventDefault();event.stopPropagation();const pos = select();if (typeof pos === 'number') editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run(); };
      function render() {
        image.src = current.attrs.src;image.alt = current.attrs.alt || '';
        caption.textContent = current.attrs.caption || 'Añade un pie de imagen (opcional)';
        caption.classList.toggle('is-empty', !current.attrs.caption);
      }
      render();
      return { dom: figure, update(next) { if (next.type !== current.type) return false;current = next;render();return true; },
        stopEvent: event => !!event.target.closest('button'), ignoreMutation: () => true };
    };
  },
});
