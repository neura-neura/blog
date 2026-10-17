// A blank editing canvas is not a stored draft until explicitly created.
export function hasDraftContent(draft) {
  if (draft.title?.trim() || draft.cover?.trim() || draft.markdown?.trim()) return true;
  const html = draft.html || '';
  if (/<(?:img|video|audio|hr|table)\b|data-latex\s*=/i.test(html)) return true;
  return Boolean(html.replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ').trim());
}

export function storeDraft(drafts, draft, { explicit = false } = {}) {
  const index = drafts.findIndex(item => item.id === draft.id);
  if (index < 0 && !explicit && draft.status !== 'published' && !hasDraftContent(draft)) return drafts;
  if (index < 0) return [{ ...draft }, ...drafts];
  return drafts.map((item, i) => i === index ? { ...draft } : item);
}
