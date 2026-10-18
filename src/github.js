const API_ROOT = 'https://api.github.com';

const validSlug = (slug) => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHubClient {
  constructor({ owner, repo, token, branch = 'main', fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
    if (!owner || !repo || !token) throw new Error('Faltan las credenciales o el repositorio de GitHub.');
    this.owner = owner;
    this.repo = repo;
    this.token = token;
    this.branch = branch;
    this.fetchImpl = fetchImpl;
    this.repoRoot = `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  async request(path, options = {}) {
    const response = await this.fetchImpl(`${this.repoRoot}${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    if (response.ok) return response.status === 204 ? null : response.json();
    if (response.status === 404 && (!options.method || options.method === 'GET')) return null;
    const messages = {
      401: 'GitHub rechazó el token. Revisa que sea válido y que tenga acceso al repositorio.',
      403: 'GitHub denegó el acceso. Revisa los permisos del token y los límites de la API.',
      404: 'GitHub no encontró el repositorio o no permite acceder a él. Revisa el propietario, el nombre y los permisos del token.',
      409: 'El repositorio cambió al mismo tiempo. Vuelve a intentar la publicación.',
      422: 'GitHub no pudo guardar el archivo. Revisa el contenido y los permisos del token.',
    };
    throw new Error(messages[response.status] || `GitHub respondió con el error ${response.status}.`);
  }

  async getPost(slug) {
    this.assertSlug(slug);
    const entry = await this.request(`/contents/posts/${encodeURIComponent(slug)}.json?ref=${encodeURIComponent(this.branch)}`);
    if (!entry) return null;
    if (entry.type !== 'file' || !entry.content) return null;
    try {
      return JSON.parse(decodeBase64(entry.content));
    } catch {
      throw new Error(`La entrada posts/${slug}.json no contiene un post JSON válido.`);
    }
  }

  async listPosts() {
    const entries = await this.request(`/contents/posts?ref=${encodeURIComponent(this.branch)}`);
    if (!entries) return [];
    if (!Array.isArray(entries)) throw new Error('GitHub devolvió una lista de posts inválida.');
    const jsonFiles = entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json'));
    const posts = await Promise.all(jsonFiles.map(async (entry) => {
      const slug = entry.name.slice(0, -5);
      if (!validSlug(slug)) return null;
      return this.getPost(slug);
    }));
    return posts.filter((post) => post?.status === 'published');
  }

  async publishPost(post) {
    if (!post || typeof post !== 'object') throw new Error('Indica el post que quieres publicar.');
    this.assertSlug(post.slug);
    if (!post.title || !(post.markdown || post.html)) {
      throw new Error('El post necesita un título y contenido Markdown o HTML para publicarse.');
    }
    const existingEntry = await this.request(`/contents/posts/${encodeURIComponent(post.slug)}.json?ref=${encodeURIComponent(this.branch)}`);
    let sha;
    if (existingEntry) {
      const existing = existingEntry.content ? JSON.parse(decodeBase64(existingEntry.content)) : null;
      if (existing?.id && existing.id !== post.id) {
        throw new Error(`Ya existe otro post con el slug “${post.slug}”. Elige un slug distinto.`);
      }
      sha = existingEntry.sha;
    }
    const published = { ...post, status: 'published' };
    const saved = await this.request(`/contents/posts/${encodeURIComponent(post.slug)}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Publish post: ${post.slug}`,
        content: encodeBase64(JSON.stringify(published, null, 2)),
        branch: this.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    const commitSha = saved?.commit?.sha;
    if (!commitSha) throw new Error('GitHub guardó el archivo, pero no devolvió el commit. Comprueba el repositorio antes de volver a publicar.');
    const url = `https://${this.owner}.github.io/${this.repo}/posts/${encodeURIComponent(post.slug)}.html`;
    return { commitSha, url, slug: post.slug };
  }

  async deletePost(slug) {
    this.assertSlug(slug);
    const path = `/contents/posts/${encodeURIComponent(slug)}.json?ref=${encodeURIComponent(this.branch)}`;
    const existing = await this.request(path);
    if (!existing) return { commitSha: null, slug, deleted: false };
    const result = await this.request(`/contents/posts/${encodeURIComponent(slug)}.json`, {
      method: 'DELETE',
      body: JSON.stringify({
        message: `Delete post: ${slug}`,
        sha: existing.sha,
        branch: this.branch,
      }),
    });
    const commitSha = result?.commit?.sha;
    if (!commitSha) throw new Error('GitHub no confirmó la eliminación con un commit. Comprueba el repositorio antes de volver a intentarlo.');
    return { commitSha, slug, deleted: true };
  }

  async getDeploymentStatus(commitSha) {
    if (!commitSha) throw new Error('Indica el commit para consultar el estado de publicación.');
    const result = await this.request(`/actions/runs?head_sha=${encodeURIComponent(commitSha)}`);
    const run = result?.workflow_runs?.[0];
    return run
      ? { status: run.status, conclusion: run.conclusion, url: run.html_url }
      : { status: 'unknown', conclusion: null, url: null };
  }

  assertSlug(slug) {
    if (!validSlug(slug)) throw new Error('El slug debe usar minúsculas, números y guiones simples.');
  }
}
