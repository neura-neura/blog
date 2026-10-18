import { GitHubClient } from './github.js';

const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0))));
const encode = value => {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

// Never send a draft to the public site repository, even if a caller passes one.
export class PrivateDraftClient extends GitHubClient {
  constructor(options) { super({ ...options, repo: `${options.repo}-drafts` }); }

  async assertPrivate() {
    const repository = await this.request('');
    if (!repository) throw Error(`Tu token necesita acceso a ${this.repo}, con permiso Contents: Read and write. Revisa el acceso a borradores en la nube.`);
    if (repository.private !== true) throw Error('No se guardó el borrador: el repositorio de borradores debe ser privado.');
    if (!repository.permissions?.push) throw Error('Tu token no permite guardar en el repositorio privado. Revisa sus permisos.');
    return repository;
  }

  async readDraft(entry) {
    if (!entry) return null;
    const file = entry.content ? entry : await this.request(`/git/blobs/${encodeURIComponent(entry.sha)}`);
    if (!file?.content) throw Error('No se pudo leer el borrador en la nube.');
    const draft = decode(file.content);
    if (!validId(draft.id) || typeof draft.markdown !== 'string' || typeof draft.title !== 'string') throw Error('El borrador en la nube tiene un formato inválido.');
    return draft;
  }

  async listDrafts() {
    await this.assertPrivate();
    const entries = await this.request(`/contents/drafts?ref=${encodeURIComponent(this.branch)}`, { cache: 'no-store' });
    if (!entries) return [];
    if (!Array.isArray(entries)) throw Error('No se pudieron leer los borradores en la nube.');
    return Promise.all(entries.filter(file => file.type === 'file' && validId(file.name.replace(/\.json$/, '')) && file.name.endsWith('.json')).map(async file => {
      const entry = await this.request(`/contents/drafts/${encodeURIComponent(file.name)}?ref=${encodeURIComponent(this.branch)}`, { cache: 'no-store' });
      return this.readDraft(entry);
    })).then(drafts => drafts.filter(Boolean));
  }

  async saveDraft(draft, expectedVersion) {
    if (!validId(draft?.id)) throw Error('El borrador necesita un identificador válido.');
    await this.assertPrivate();
    const path = `/contents/drafts/${encodeURIComponent(draft.id)}.json`;
    const existing = await this.request(`${path}?ref=${encodeURIComponent(this.branch)}`, { cache: 'no-store' });
    if (existing) {
      const remote = await this.readDraft(existing);
      if (remote.privateSavedAt !== expectedVersion) throw Error('Este borrador cambió en otro dispositivo. Abre Borradores y recupera la versión más reciente antes de volver a guardarlo.');
    }
    const saved = {};
    for (const key of ['id', 'title', 'markdown', 'html', 'cover', 'coverSource', 'coverCrop', 'slug', 'tags', 'excerpt', 'author', 'authorBio', 'authorHandle', 'publishedAt', 'updatedAt']) {
      if (draft[key] !== undefined) saved[key] = draft[key];
    }
    saved.status = 'draft';
    saved.originalStatus = draft.status === 'published' ? 'published' : 'draft';
    saved.privateSavedAt = new Date().toISOString();
    const content = encode(saved);
    if (content.length > 14 * 1024 * 1024) throw Error('Este borrador supera los 10 MB. Reduce el tamaño de sus imágenes antes de guardarlo.');
    const result = await this.request(path, { method: 'PUT', body: JSON.stringify({
      message: 'Save private draft', content, branch: this.branch, ...(existing?.sha ? { sha: existing.sha } : {}),
    }) });
    if (!result?.commit?.sha) throw Error('GitHub no confirmó el guardado en la nube. Comprueba Borradores antes de reintentar.');
    return saved;
  }
}
