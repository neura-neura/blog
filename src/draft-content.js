// Preserve the saved serialization when loading a document did not change its content.
// Tiptap may normalize HTML/Markdown as it parses an existing draft.
export function createDraftBodyTracker(editor, parseMarkdown = value => value) {
  let loadedJSON = '', sourceValue = '';
  return {
    reset(draft) {
      loadedJSON = JSON.stringify(editor.getJSON());
      sourceValue = draft.markdown || '';
    },
    sync(draft, source) {
      if (source !== undefined && source !== sourceValue) {
        editor.commands.setContent(parseMarkdown(source), { contentType: 'markdown', emitUpdate: false });
        draft.markdown = source;
        draft.html = editor.getHTML();
        sourceValue = source;
        loadedJSON = JSON.stringify(editor.getJSON());
        return;
      }
      const json = JSON.stringify(editor.getJSON());
      if (json === loadedJSON) return;
      draft.markdown = editor.getMarkdown();
      draft.html = editor.getHTML();
      loadedJSON = json;
      sourceValue = draft.markdown;
    },
  };
}

// HTML is the editable source of rich-text drafts. Markdown is a derived export;
// comparing both independently reports serialization changes as user edits.
export function sameDraftContent(a, b, normalizeHTML = html => html) {
  if ((a.title || '') !== (b.title || '') || (a.cover || '') !== (b.cover || '')) return false;
  if (a.html && b.html) return normalizeHTML(a.html) === normalizeHTML(b.html);
  return (a.html || '') === (b.html || '') && (a.markdown || '') === (b.markdown || '');
}

// StarterKit supplies a writable paragraph after a terminal image, heading, etc.
// Compare the same document shape whether that paragraph was serialized or added on load.
export function normalizedEditorDocument(doc) {
  const content = [...(doc.content || [])];
  if (content.at(-1)?.type !== 'paragraph') content.push({ type: 'paragraph' });
  return JSON.stringify({ ...doc, content });
}
