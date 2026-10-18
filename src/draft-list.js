import { sameDraftContent } from './draft-content.js';
import {visibleCloudDraft} from './article-lifecycle.js';
export function draftEntries(local, remote, sameContent = sameDraftContent, published = []) {
  const entries = new Map();
  for (const draft of remote) {
    if (visibleCloudDraft(draft,published)) entries.set(draft.id, { draft, remoteOnly: true, storage: 'Guardado en la nube' });
  }
  for (const draft of local) {
    if (draft.status === 'published') continue;
    const saved = remote.find(item => item.id === draft.id);
    const changed = saved && !sameContent(draft, saved);
    if(saved&&changed&&(saved.updatedAt||'')>(draft.updatedAt||'')&&visibleCloudDraft(saved,published))continue;
    entries.set(draft.id, { draft, remoteOnly: false, storage: saved
      ? changed ? 'Cambios locales · versión anterior en la nube' : 'En este navegador y en la nube'
      : draft.privateSavedAt ? 'En este navegador · guardado en la nube por comprobar' : 'Solo en este navegador' });
  }
  return [...entries.values()].sort((a, b) => (b.draft.updatedAt || '').localeCompare(a.draft.updatedAt || ''));
}
