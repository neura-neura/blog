import test from 'node:test';
import assert from 'node:assert/strict';
import { VisibilityClient } from '../src/visibility-client.js';

const encode = value => btoa(unescape(encodeURIComponent(JSON.stringify(value))));
const decode = value => JSON.parse(decodeURIComponent(escape(atob(value))));

function fixture({ sourceVisibility = 'public', post = {}, failDelete = false } = {}) {
  const repos = { public: 'public-content', unlisted: 'unlisted-content', private: 'private-content' };
  const files = Object.fromEntries(Object.values(repos).map(repo => [repo, new Map()]));
  const basePost = { id: 'article-id', slug: 'article', title: 'Private body title', markdown: 'SENSITIVE BODY', status: 'published', updatedAt: '2026-01-01T00:00:00Z', ...post, visibility: sourceVisibility };
  files[repos[sourceVisibility]].set(`posts/${basePost.slug}.json`, { json: { ...basePost }, sha: 'source-sha' });
  const calls = [];
  let failSourceDelete = failDelete;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const [, , , repoName] = parsed.pathname.split('/');
    const repo = decodeURIComponent(repoName);
    const pathname = parsed.pathname.split('/').slice(5).join('/');
    calls.push({ repo, pathname, method: options.method || 'GET', body: options.body });
    const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
    if (parsed.pathname.split('/').length === 4) {
      return response({ private: repo !== repos.public, permissions: { push: true } });
    }
    if (pathname === 'build-request.json') {
      if (options.method === 'PUT') return response({ commit: { sha: 'build-request-sha' } });
      return response(null, 404);
    }
    if (pathname === 'posts' && (!options.method || options.method === 'GET')) {
      return response([...files[repo].keys()].filter(name => name.startsWith('posts/')).map(name => ({ type: 'file', name: name.slice(6) })));
    }
    const file = files[repo]?.get(pathname);
    if (!options.method || options.method === 'GET') return file ? response({ type: 'file', content: encode(file.json), sha: file.sha }) : response(null, 404);
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      files[repo].set(pathname, { json: decode(body.content), sha: 'dest-sha' });
      return response({ commit: { sha: 'copy-sha' } });
    }
    if (options.method === 'DELETE') {
      if (repo === repos[sourceVisibility] && failSourceDelete) { failSourceDelete = false; return response({ message: 'failed' }, 403); }
      files[repo].delete(pathname);
      return response({ commit: { sha: 'delete-sha' } });
    }
    return response({}, 404);
  };
  const client = new VisibilityClient({ owner: 'owner', repo: 'blog', token: 'token', fetchImpl, repositories: repos });
  return { client, calls, files, repos, basePost };
}

test('all six visibility transitions copy destination before deleting source', async () => {
  for (const from of ['public', 'unlisted', 'private']) for (const to of ['public', 'unlisted', 'private']) {
    if (from === to) continue;
    const { client, calls, files, repos, basePost } = fixture({ sourceVisibility: from, post: { slug: from === 'unlisted' ? 'old-link' : 'article', ...(from === 'unlisted' ? { publicSlug: 'article' } : {}) } });
    const result = await client.changeVisibility(basePost, to);
    const destRepo = repos[to], sourceRepo = repos[from];
    const destWrite = calls.findIndex(call => call.repo === destRepo && call.method === 'PUT' && call.pathname.includes('.json'));
    const sourceDelete = calls.findIndex(call => call.repo === sourceRepo && call.method === 'DELETE');
    assert.ok(destWrite >= 0 && sourceDelete > destWrite, `${from} -> ${to} must copy before deleting`);
    assert.equal(files[sourceRepo].has(`posts/${basePost.slug}.json`), false);
    const expectedSlug = to === 'unlisted' ? result.post.slug : to === 'public' ? 'article' : basePost.id;
    assert.equal(result.post.slug, expectedSlug);
    assert.equal(result.post.visibility, to);
    if (to === 'unlisted') assert.match(result.post.slug, /^[0-9a-f-]{36}$/i);
    if (from === 'unlisted' && to === 'public') assert.equal(result.post.slug, 'article');
    if (to === 'private') assert.match(result.result.url, /editor\.html#article=article-id$/);
    const requests = calls.filter(call => call.pathname === 'build-request.json' && call.method === 'PUT');
    assert.equal(requests.length, 1);
    assert.doesNotMatch(requests[0].body, /SENSITIVE BODY|Private body title|article-id/);
  }
});

test('visibility sources enforce repository privacy and write access', async () => {
  const fakeResponse = value => async () => ({ ok: true, status: 200, json: async () => value });
  const makeClient = fetchImpl => new VisibilityClient({ owner: 'owner', repo: 'blog', token: 'token', fetchImpl, repositories: { public: 'public-content', unlisted: 'unlisted-content', private: 'private-content' } });
  const client = makeClient(fakeResponse({ private: false, permissions: { push: true } }));
  await assert.rejects(client.checkedSource('unlisted'), /debe ser un repositorio privado/);
  const denied = makeClient(fakeResponse({ private: true, permissions: { push: false } }));
  await assert.rejects(denied.checkedSource('private'), /acceso de lectura y escritura/);
});

test('stale source and failed source deletion preserve the original article', async () => {
  const stale = fixture({ post: { updatedAt: '2026-01-01T00:00:00Z' } });
  stale.files[stale.repos.public].get('posts/article.json').json.updatedAt = '2025-12-01T00:00:00Z';
  await assert.rejects(stale.client.changeVisibility(stale.basePost, 'unlisted'), /otro dispositivo/);
  assert.equal(stale.calls.some(call => call.method === 'PUT' && call.pathname.includes('.json')), false);

  const rollback = fixture({ failDelete: true });
  await assert.rejects(rollback.client.changeVisibility(rollback.basePost, 'unlisted'), /acceso/);
  assert.equal(rollback.files[rollback.repos.public].has('posts/article.json'), true);
  assert.equal([...rollback.files[rollback.repos.unlisted].keys()].some(key => key.startsWith('posts/')), false);
});

test('post listing merges duplicate identities using the newest record', async () => {
  const { client, files, repos } = fixture();
  files[repos.unlisted].set('posts/link.json', { json: { id: 'article-id', slug: 'link', status: 'published', visibility: 'unlisted', updatedAt: '2026-02-01T00:00:00Z' }, sha: 'new' });
  files[repos.private].set('posts/article-id.json', { json: { id: 'article-id', slug: 'article-id', status: 'published', visibility: 'private', updatedAt: '2026-03-01T00:00:00Z' }, sha: 'newest' });
  const posts = await client.listPosts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].visibility, 'private');
  assert.equal(posts[0].updatedAt, '2026-03-01T00:00:00Z');
});
