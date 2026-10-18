const contentKeys = ['title', 'markdown', 'html', 'cover'];
export function draftEntries(local, remote) {
  const entries = new Map();
  for (const draft of remote) {
    if (draft.originalStatus !== 'published') entries.set(draft.id, { draft, remoteOnly: true, storage: 'Guardado en la nube' });
  }
  for (const draft of local) {
    if (draft.status === 'published') { entries.delete(draft.id); continue; }
    const saved = remote.find(item => item.id === draft.id);
    const changed = saved && contentKeys.some(key => (draft[key] || '') !== (saved[key] || ''));
    entries.set(draft.id, { draft, remoteOnly: false, storage: saved
      ? changed ? 'Cambios locales · versión anterior en la nube' : 'En este navegador y en la nube'
      : draft.privateSavedAt ? 'En este navegador · guardado en la nube por comprobar' : 'Solo en este navegador' });
  }
  return [...entries.values()].sort((a, b) => (b.draft.updatedAt || '').localeCompare(a.draft.updatedAt || ''));
}
