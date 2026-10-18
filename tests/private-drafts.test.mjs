import test from 'node:test';
import assert from 'node:assert/strict';
import { PrivateDraftClient } from '../src/private-drafts.js';

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
const draft = { id: 'draft-one', title: 'Idea privada 🌸', markdown: 'Texto sin publicar', html: '<p>Texto sin publicar</p>', status: 'draft', cover: 'data:image/png;base64,AAAA' };
const client = fetchImpl => new PrivateDraftClient({ owner: 'writer', repo: 'blog', token: 'secret', fetchImpl });

test('private drafts never read or write content when repository is public, absent or unauthorized', async () => {
  for (const metadata of [{ private: false, permissions: { push: true } }, null, { private: true, permissions: { push: false } }]) {
    for (const action of [api => api.listDrafts(), api => api.saveDraft(draft)]) {
      const calls = [];
      const api = client(async url => { calls.push(url); return response(metadata ? 200 : 404, metadata); });
      await assert.rejects(action(api), /privado|privados|privada|nube/);
      assert.deepEqual(calls, ['https://api.github.com/repos/writer/blog-drafts']);
    }
  }
});

test('explicit private save sends Unicode content only to private repository and excludes secrets', async () => {
  const calls = [];
  const api = client(async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'PUT') return response(201, { commit: { sha: 'saved' } });
    return response(url.includes('/contents/') ? 404 : 200, { private: true, permissions: { push: true } });
  });
  const saved = await api.saveDraft({ ...draft, token: 'never-upload', owner: 'writer', privateSavedAt: 'old' });
  assert.equal(saved.title, draft.title);
  assert.equal(saved.status, 'draft');
  assert.ok(saved.privateSavedAt);
  const write = calls.find(call => call.options.method === 'PUT');
  assert.equal(write.url, 'https://api.github.com/repos/writer/blog-drafts/contents/drafts/draft-one.json');
  const body = JSON.parse(write.options.body);
  const content = JSON.parse(Buffer.from(body.content, 'base64').toString());
  assert.equal(content.markdown, draft.markdown);
  assert.equal(content.token, undefined);
  assert.equal(content.owner, undefined);
  assert.equal(body.sha, undefined);
  assert.equal(calls.filter(call => call.options.method === 'PUT').length, 1);
});

test('private drafts load on another device, including image-heavy files over Contents API limit', async () => {
  const saved = { ...draft, privateSavedAt: 'version-one' };
  const api = client(async url => {
    if (url.endsWith('/blog-drafts')) return response(200, { private: true, permissions: { push: true } });
    if (url.includes('/git/blobs/')) return response(200, { content: encode(saved) });
    if (url.includes('/draft-one.json')) return response(200, { sha: 'large-blob', content: '', encoding: 'none' });
    return response(200, [{ type: 'file', name: 'draft-one.json' }, { type: 'file', name: 'README.md' }]);
  });
  assert.deepEqual(await api.listDrafts(), [saved]);
});

test('private saves reject stale copies and use SHA when updating the expected version', async () => {
  const writes = [];
  const api = client(async (url, options) => {
    if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); return response(200, { commit: { sha: 'updated' } }); }
    return response(200, url.includes('/contents/') ? { sha: 'current-sha', content: encode({ ...draft, privateSavedAt: 'remote-version' }) } : { private: true, permissions: { push: true } });
  });
  await assert.rejects(api.saveDraft(draft), /otro dispositivo/);
  await assert.rejects(api.saveDraft(draft, 'stale'), /otro dispositivo/);
  assert.equal(writes.length, 0);
  await api.saveDraft(draft, 'remote-version');
  assert.equal(writes[0].sha, 'current-sha');
});

test('private save validates IDs and does not claim success on a failed write', async () => {
  await assert.rejects(client(() => { throw Error('unexpected network'); }).saveDraft({ ...draft, id: '../escape' }), /identificador/);
  const api = client(async (url, options) => {
    if (options.method === 'PUT') return response(200, {});
    return response(url.includes('/contents/') ? 404 : 200, { private: true, permissions: { push: true } });
  });
  await assert.rejects(api.saveDraft(draft), /no confirmó/);
});

test('cloud refresh and version checks bypass cached Contents API responses', async () => {
  const calls=[];
  const saved={...draft,privateSavedAt:'latest'};
  const api=client(async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/blog-drafts'))return response(200,{private:true,permissions:{push:true}});
    if(url.includes('/draft-one.json'))return response(200,{sha:'latest-blob',content:encode(saved)});
    return response(200,[{type:'file',name:'draft-one.json'}]);
  });
  await api.listDrafts();
  await assert.rejects(api.saveDraft(draft,'old'),/otro dispositivo/);
  assert.ok(calls.filter(call=>call.url.includes('/contents/')).every(call=>call.options.cache==='no-store'));
});
