import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
const decode = value => JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('published library filters visibility and relocates posts through the editor UI', async t => {
  const bundled = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' }, logLevel: 'silent' });
  const repos = { public: 'blog-public', unlisted: 'blog-unlisted', private: 'blog-private' };
  const files = Object.fromEntries(Object.values(repos).map(repo => [repo, new Map()]));
  const publicPost = { id: 'article-ui', slug: 'my-article', title: 'Visibility test', markdown: 'A real article body', html: '<p>A real article body</p>', status: 'published', updatedAt: '2026-10-18T10:00:00Z', publishedAt: '2026-10-18T10:00:00Z' };
  files[repos.public].set('posts/my-article.json', { post: { ...publicPost }, sha: 'seed-sha' });
  const calls = [];
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://owner.github.io/blog/editor.html', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.crypto.randomUUID = () => '12345678-1234-4234-9234-123456789abc';
  w.blogContentRepositories = repos;
  w.localStorage.setItem('blog-studio-token-v2:/blog/', 'test-token');
  w.localStorage.setItem('blog-studio-drafts-v1', JSON.stringify([publicPost, { id: 'new-draft', slug: 'new-draft', title: 'Draft to route', markdown: 'Draft body', html: '<p>Draft body</p>', status: 'draft' }, { id: 'private-draft', slug: 'private-draft', title: 'Private draft route', markdown: 'Only private', html: '<p>Only private</p>', status: 'draft' }]));

  let pageReady=true,buildFailed=false;
  w.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    if(parsed.hostname.endsWith('.github.io'))return {ok:pageReady,text:async()=>`<meta name="article-version" content="${parsed.searchParams.get('v')}">`};
    if(parsed.pathname.includes('/actions/'))return {ok:true,status:200,json:async()=>({workflow_runs:[{status:'completed',conclusion:buildFailed?'failure':'success'}]})};
    const pieces = parsed.pathname.split('/');
    const repo = decodeURIComponent(pieces[3] || '');
    const pathname = pieces.slice(5).join('/');
    const method = options.method || 'GET';
    calls.push({ repo, pathname, method });
    const respond = value => ({ ok: true, status: 200, json: async () => value });
    const missing = () => ({ ok: false, status: 404, json: async () => ({}) });
    if (pieces.length === 4) return respond({ private: repo !== repos.public || repo.endsWith('-drafts'), permissions: { push: true } });
    if (repo.endsWith('-drafts') && pathname === 'drafts') return respond([]);
    if (pathname === 'posts') {
      return respond([...files[repo].keys()].filter(path => path.startsWith('posts/')).map(path => ({ type: 'file', name: path.slice(6) })));
    }
    if (pathname.startsWith('posts/')) {
      const filePath = pathname;
      const found = files[repo].get(filePath);
      if (method === 'GET') return found ? respond({ type: 'file', sha: found.sha, content: encode(found.post) }) : missing();
      if (method === 'PUT') {
        const body = JSON.parse(options.body);
        files[repo].set(filePath, { post: decode(body.content), sha: `sha-${repo}` });
        return respond({ commit: { sha: `commit-${repo}` } });
      }
      if (method === 'DELETE') {
        files[repo].delete(filePath);
        return respond({ commit: { sha: `deleted-${repo}` } });
      }
    }
    if (pathname === 'build-request.json') {
      if (method === 'PUT') return respond({ commit: { sha: 'build-request-commit' } });
      return missing();
    }
    return missing();
  };
  w.eval(bundled.outputFiles[0].text);

  const wait = async predicate => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (predicate()) return;
      await tick();
    }
    throw new Error(`Timed out waiting for UI: ${w.document.body.textContent.slice(0, 400)}; calls=${JSON.stringify(calls)}`);
  };
  const click = async selector => {
    const element = w.document.querySelector(selector);
    assert.ok(element, `Expected UI element: ${selector}`);
    element.click();
    await tick();
  };
  const submitVisibility = async (value, expectedRepo) => {
    await click('[data-action="more"]');
    await click('[data-action="visibility"]');
    const title = w.document.querySelector('#article-title');
    assert.equal(title.readOnly, true);
    assert.equal(title.value, 'Visibility test');
    const radio = w.document.querySelector(`#dialog-form input[name="visibility"][value="${value}"]`);
    assert.ok(radio);
    radio.checked = true;
    await click('#dialog-form [type="submit"]');
    await wait(() => w.document.querySelector('#article-link-result'));
    if(buildFailed){
      await wait(()=>/No se pudo actualizar/.test(w.document.querySelector('#article-link-result').textContent));
      assert.equal(w.document.querySelector('.article-open-link'),null,'failed deployments must not expose the link');
      pageReady=true;buildFailed=false;
      await click('[data-action="retry-article-publication"]');
    }
    await wait(()=>/Artículo listo|Artículo privado/.test(w.document.querySelector('#article-link-result').textContent));
    assert.equal(w.document.querySelectorAll('#article-link-result [data-action="retry-build"]').length,0);
    assert.equal(w.document.querySelectorAll('#article-link-result .article-open-link').length,value==='private'?0:1);
    await click('[data-action="close"]');
    assert.equal(files[expectedRepo].size, 1, `post should be in ${expectedRepo}`);
  };

  try {
    await wait(() => calls.some(call => call.repo === repos.public && call.pathname === 'posts'));
    await click('[data-action="panel-published"]');
    await wait(() => w.document.querySelector('[data-published="0"]'));
    const list = w.document.querySelector('#articles-list');
    assert.match(list.textContent, /Públicos/);
    assert.match(list.textContent, /No listados/);
    assert.match(list.textContent, /Privados/);
    assert.match(list.textContent, /Público/);

    // Exercise every chip as new records become available after each relocation.
    await click('[data-visibility-filter="public"]');
    assert.ok(w.document.querySelector('[data-published="0"]'));
    await click('[data-published="0"]');
    pageReady=false;buildFailed=true;
    await submitVisibility('unlisted', repos.unlisted);
    const unlisted = files[repos.unlisted].get('posts/12345678-1234-4234-9234-123456789abc.json').post;
    assert.equal(unlisted.visibility, 'unlisted');
    assert.equal(unlisted.publicSlug, 'my-article');
    assert.equal(unlisted.slug, '12345678-1234-4234-9234-123456789abc');
    assert.equal(files[repos.public].size, 0);

    await click('[data-action="panel-published"]');
    await click('[data-visibility-filter="unlisted"]');
    await wait(() => w.document.querySelector('[data-published="0"]'));
    assert.match(w.document.querySelector('#articles-list').textContent, /No listado/);
    await click('[data-published="0"]');
    await submitVisibility('private', repos.private);
    assert.equal(files[repos.unlisted].size, 0);
    const privatePost = files[repos.private].get('posts/article-ui.json').post;
    assert.equal(privatePost.visibility, 'private');
    assert.equal(privatePost.slug, 'article-ui');
    assert.match(w.document.querySelector('.badge').textContent, /Privado/);

    await click('[data-action="panel-published"]');
    await click('[data-visibility-filter="private"]');
    await wait(() => w.document.querySelector('[data-published="0"]'));
    assert.match(w.document.querySelector('#articles-list').textContent, /Privado/);
    await click('[data-published="0"]');
    await submitVisibility('public', repos.public);
    const republished = files[repos.public].get('posts/my-article.json').post;
    assert.equal(republished.visibility, 'public');
    assert.equal(republished.slug, 'my-article');
    assert.equal(files[repos.private].size, 0);

    // Re-check the other three directed edges from a published public source.
    await click('[data-action="panel-published"]');
    await click('[data-visibility-filter="public"]');
    await wait(() => w.document.querySelector('[data-published="0"]'));
    await click('[data-published="0"]');
    await submitVisibility('private', repos.private);
    await click('[data-action="panel-published"]');
    await click('[data-visibility-filter="private"]');
    await wait(() => w.document.querySelector('[data-published="0"]'));
    await click('[data-published="0"]');
    await submitVisibility('unlisted', repos.unlisted);
    await click('[data-action="panel-published"]');
    await click('[data-visibility-filter="unlisted"]');
    await wait(() => w.document.querySelector('[data-published="0"]'));
    await click('[data-published="0"]');
    await submitVisibility('public', repos.public);
    assert.equal(files[repos.public].get('posts/my-article.json').post.slug, 'my-article');

    // Publishing a fresh draft must route according to the selected visibility.
    await click('[data-action="panel-drafts"]');
    await wait(() => w.document.querySelector('[data-draft="new-draft"]'));
    await click('[data-draft="new-draft"]');
    await click('[data-action="publish"]');
    let choice = w.document.querySelector('#dialog-form input[name="visibility"][value="unlisted"]');
    assert.ok(choice);
    choice.checked = true;
    await click('#dialog-form [type="submit"]');
    await wait(() => [...files[repos.unlisted].values()].some(item => item.post.id === 'new-draft'));
    assert.equal([...files[repos.public].values()].some(item => item.post.id === 'new-draft'), false);
    const unlistedDraft = [...files[repos.unlisted].values()].find(item => item.post.id === 'new-draft').post;
    assert.equal(unlistedDraft.visibility, 'unlisted');
    assert.match(unlistedDraft.slug, /^[0-9a-f-]{36}$/i);

    // Make another draft and publish it privately.
    await click('[data-action="panel-drafts"]');
    await wait(() => w.document.querySelector('[data-draft="private-draft"]'));
    await click('[data-draft="private-draft"]');
    await click('[data-action="publish"]');
    choice = w.document.querySelector('#dialog-form input[name="visibility"][value="private"]');
    assert.ok(choice);
    choice.checked = true;
    await click('#dialog-form [type="submit"]');
    await wait(() => files[repos.private].has('posts/private-draft.json'));
    assert.equal([...files[repos.public].values()].some(item => item.post.id === 'private-draft'), false);
    assert.equal([...files[repos.unlisted].values()].some(item => item.post.id === 'private-draft'), false);
    assert.equal(files[repos.private].get('posts/private-draft.json').post.visibility, 'private');

    const bodyRoutes = calls.filter(call => call.method === 'PUT' && call.pathname.startsWith('posts/'));
    assert.ok(bodyRoutes.length >= 8);
    assert.ok(calls.some(call => call.pathname === 'build-request.json' && call.method === 'PUT'));
  } finally {
    w.dispatchEvent(new w.Event('beforeunload'));
  }
});
