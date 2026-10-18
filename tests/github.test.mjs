import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient } from '../src/github.js';

const encode = (value) => btoa(unescape(encodeURIComponent(JSON.stringify(value, null, 2))));
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const clientWith = (fetchImpl) => new GitHubClient({ owner: 'writer', repo: 'notes', token: 'secret-token', fetchImpl });

test('editor access requires GitHub-confirmed write permission on this repository', async () => {
  for(const permissions of [{push:false,pull:true},{},null]){
    const client=clientWith(async()=>response(200,{permissions}));
    await assert.rejects(client.assertEditorAccess(),/Solo el propietario/);
  }
  const allowed=clientWith(async(url)=>{assert.equal(url,'https://api.github.com/repos/writer/notes');return response(200,{permissions:{push:true}});});
  assert.equal(await allowed.assertEditorAccess(),true);
  await assert.rejects(clientWith(async()=>response(401,{})).assertEditorAccess(),/rechazó el token/);
  await assert.rejects(clientWith(async()=>response(404,{})).assertEditorAccess(),/Solo el propietario/);
});

test('profile publication creates or updates one shared file and excludes connection credentials', async () => {
  for(const exists of [false,true]){
    const calls=[];
    const client=clientWith(async (url,options)=>{
      calls.push({url,options});
      return options.method==='PUT'?response(200,{commit:{sha:'profile-commit'}}):response(exists?200:404,{sha:'old-profile'});
    });
    assert.deepEqual(await client.saveProfile({author:'林夏',bio:'Bio',handle:'@writer',updatedAt:'2026-01-01T00:00:00Z',token:'secret-token',owner:'writer',repo:'notes'}),{commitSha:'profile-commit'});
    const body=JSON.parse(calls[1].options.body);
    assert.equal(body.sha,exists?'old-profile':undefined);
    const profile=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.content),c=>c.charCodeAt(0))));
    assert.equal(profile.author,'林夏');assert.equal(profile.handle,'writer');
    assert.deepEqual(Object.keys(profile).sort(),['author','avatar','banner','bio','handle','updatedAt','website']);
    assert.match(calls[1].url,/\/contents\/blog-profile.json$/);
  }
});

test('profile save failures are reported without claiming publication', async () => {
  const client=clientWith(async (_url,options)=>options.method==='PUT'?response(403,{}):response(404,{}));
  await assert.rejects(client.saveProfile({author:'Ada'}),/permisos/);
  const unconfirmed=clientWith(async (_url,options)=>options.method==='PUT'?response(200,{}):response(404,{}));
  await assert.rejects(unconfirmed.saveProfile({author:'Ada'}),/no confirmó/);
});

test('default fetch retains the browser global receiver for publication and status requests', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const methods = [];
  globalThis.fetch = async function (_url, options) {
    assert.equal(this, globalThis, 'native browser fetch must not receive the GitHubClient as this');
    methods.push(options.method || 'GET');
    if (options.method === 'PUT') return response(201, { commit: { sha: 'native-fetch-commit' } });
    if (_url.includes('/actions/runs')) return response(200, { workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'https://github.com/writer/notes/actions/runs/1' }] });
    return response(404, {});
  };
  const client = new GitHubClient({ owner: 'writer', repo: 'notes', token: 'test-token' });
  const published = await client.publishPost({ id: 'browser', slug: 'browser-test', title: 'Browser test', markdown: 'Body' });
  assert.equal(published.commitSha, 'native-fetch-commit');
  assert.equal((await client.getDeploymentStatus(published.commitSha)).conclusion, 'success');
  assert.deepEqual(methods, ['GET', 'PUT', 'GET']);
});

test('getPost and listPosts read JSON files and only list published posts', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/contents/posts?ref=main')) return response(200, [
      { type: 'file', name: 'public.json' }, { type: 'file', name: 'draft.json' }, { type: 'dir', name: 'nested' },
    ]);
    if (url.includes('public.json')) return response(200, { type: 'file', content: encode({ slug: 'public', status: 'published' }) });
    if (url.includes('draft.json')) return response(200, { type: 'file', content: encode({ slug: 'draft', status: 'draft' }) });
    return response(404, {});
  };
  const client = clientWith(fetchImpl);
  assert.deepEqual(await client.listPosts(), [{ slug: 'public', status: 'published' }]);
  assert.deepEqual(await client.getPost('missing'), null);
  assert.match(calls[0].options.headers.Authorization, /secret-token/);
  assert.equal(calls[0].url, 'https://api.github.com/repos/writer/notes/contents/posts?ref=main');
});

test('publishPost creates or updates a Unicode post using the Contents API SHA', async () => {
  const bodies = [];
  let getCount = 0;
  const fetchImpl = async (url, options) => {
    if (options.method === 'PUT') {
      bodies.push({ url, body: JSON.parse(options.body) });
      return response(200, { commit: { sha: 'commit123' } });
    }
    getCount += 1;
    return getCount === 1
      ? response(200, { type: 'file', sha: 'blob456', content: encode({ id: 'same-id', status: 'draft' }) })
      : response(404, {});
  };
  const client = clientWith(fetchImpl);
  const result = await client.publishPost({ id: 'same-id', slug: 'cafe-notes', title: 'Café ☕', markdown: 'Olá, mundo 🌎', status: 'draft' });
  const stored = JSON.parse(decodeURIComponent(escape(atob(bodies[0].body.content))));
  assert.deepEqual(result, { commitSha: 'commit123', url: 'https://writer.github.io/notes/posts/cafe-notes.html', slug: 'cafe-notes' });
  assert.equal(bodies[0].body.sha, 'blob456');
  assert.equal(stored.title, 'Café ☕');
  assert.equal(stored.markdown, 'Olá, mundo 🌎');
  assert.equal(stored.status, 'published');
});

test('publishPost rejects slug collisions and invalid posts before writing', async () => {
  let puts = 0;
  const client = clientWith(async (_url, options) => {
    if (options.method === 'PUT') puts += 1;
    return response(200, { sha: 'blob', content: encode({ id: 'other' }) });
  });
  await assert.rejects(client.publishPost({ id: 'mine', slug: 'same', title: 'Title', markdown: 'body' }), /otro post/);
  await assert.rejects(client.publishPost({ slug: 'Bad Slug', title: 'Title', markdown: 'body' }), /slug/);
  await assert.rejects(client.publishPost({ slug: 'valid', title: 'Title' }), /contenido/);
  assert.equal(puts, 0);
});

test('GitHub errors give actionable Spanish guidance and never echo credentials', async () => {
  const client = clientWith(async () => response(401, {}));
  await assert.rejects(client.getPost('entry'), (error) => {
    assert.match(error.message, /token/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
});

test('PUT 404 is an error and cannot be reported as a successful publication', async () => {
  const client = clientWith(async (url, options) => options.method === 'PUT'
    ? response(404, {})
    : response(404, {}));
  await assert.rejects(
    client.publishPost({ id: 'post-id', slug: 'valid', title: 'Title', markdown: 'Body' }),
    /repositorio|propietario/,
  );
});

test('a concurrent write conflict tells the editor to retry', async () => {
  const client = clientWith(async (_url, options = {}) => options.method === 'PUT'
    ? response(409, {})
    : response(404, {}));
  await assert.rejects(
    client.publishPost({ id: 'post-id', slug: 'valid', title: 'Title', markdown: 'Body' }),
    /cambió al mismo tiempo.*Vuelve a intentar/,
  );
});

test('publishPost requires GitHub to return the resulting commit SHA', async () => {
  const client = clientWith(async (_url, options) => options.method === 'PUT'
    ? response(200, { content: {} })
    : response(404, {}));
  await assert.rejects(
    client.publishPost({ id: 'post-id', slug: 'valid', title: 'Title', markdown: 'Body' }),
    /no devolvió el commit/,
  );
});

test('deletePost removes the Contents API file with its SHA and returns commit details', async () => {
  const requests = [];
  const client = clientWith(async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === 'DELETE') return response(200, { commit: { sha: 'delete-commit' } });
    return response(200, { sha: 'blob-sha' });
  });
  assert.deepEqual(await client.deletePost('remove-me'), { commitSha: 'delete-commit', slug: 'remove-me', deleted: true });
  assert.equal(requests[1].options.method, 'DELETE');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    message: 'Delete post: remove-me', sha: 'blob-sha', branch: 'main',
  });
});

test('deletePost reports a missing post without issuing DELETE', async () => {
  let deletes = 0;
  const client = clientWith(async (_url, options = {}) => {
    if (options.method === 'DELETE') deletes += 1;
    return response(404, {});
  });
  assert.deepEqual(await client.deletePost('missing'), { commitSha: null, slug: 'missing', deleted: false });
  assert.equal(deletes, 0);
});

test('deletePost does not report success without a commit SHA', async () => {
  const client = clientWith(async (_url, options = {}) => options.method === 'DELETE'
    ? response(200, {})
    : response(200, { sha: 'blob-sha' }));
  await assert.rejects(client.deletePost('remove-me'), /no confirmó la eliminación/);
});

test('getDeploymentStatus returns the latest matching Actions run', async () => {
  const client = clientWith(async () => response(200, { workflow_runs: [
    { status: 'completed', conclusion: 'success', html_url: 'https://github.com/writer/notes/actions/runs/1' },
  ] }));
  assert.deepEqual(await client.getDeploymentStatus('sha123'), {
    status: 'completed', conclusion: 'success', url: 'https://github.com/writer/notes/actions/runs/1',
  });
});
