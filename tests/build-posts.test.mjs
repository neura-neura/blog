import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPosts } from '../scripts/build-posts.mjs';

async function fixture(t, entries) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-posts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const postsDir = path.join(root, 'posts');
  const outDir = path.join(root, 'dist');
  await mkdir(postsDir);
  for (const [name, data] of Object.entries(entries)) await writeFile(path.join(postsDir, `${name}.json`), JSON.stringify(data));
  await buildPosts({ postsDir, outDir, siteUrl: 'https://example.test/blog' });
  return { postsDir, outDir };
}

const post = (extra = {}) => ({
  id: 'one', slug: 'hello-world', title: 'Hello <script>alert(1)</script>', markdown: '# Hello',
  html: '<h1>Hello</h1><script>alert(1)</script><p onclick="alert(1)">safe <a href="javascript:alert(1)">link</a></p>',
  cover: '', author: 'Ada', excerpt: 'A short note', tags: ['writing'], publishedAt: '2025-01-02T00:00:00Z',
  updatedAt: '2025-01-03T00:00:00Z', status: 'published', ...extra,
});

test('renders published posts safely and emits linked public outputs', async (t) => {
  const { outDir } = await fixture(t, { hello: post() });
  const article = await readFile(path.join(outDir, 'posts', 'hello-world.html'), 'utf8');
  const index = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const feed = await readFile(path.join(outDir, 'feed.xml'), 'utf8');
  const sitemap = await readFile(path.join(outDir, 'sitemap.xml'), 'utf8');
  const publicPosts = JSON.parse(await readFile(path.join(outDir, 'posts.json'), 'utf8'));
  assert.match(article, /Hello &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const trustedScript = '<script type="module" src="../reader-appearance.js"></script>';
  assert.ok(article.includes(trustedScript));
  assert.doesNotMatch(article.replace(trustedScript, ''), /<script|onclick=|javascript:/i);
  assert.match(index, /src=".\/reader-appearance.js"/);
  assert.match(await readFile(path.join(outDir, 'reader-appearance.js'), 'utf8'), /initAppearance/);
  assert.match(await readFile(path.join(outDir, 'appearance.css'), 'utf8'), /--font-scale/);
  assert.match(article, /href="\.\.\/index\.html"/);
  assert.match(article, /href="\.\.\/editor\.html"/);
  assert.match(article, /<meta name="article-version" content="2025-01-03T00:00:00Z">/);
  assert.match(article, /aspect-ratio:5\/2;height:auto;object-fit:cover;object-position:center/);
  const missing = await readFile(path.join(outDir,'404.html'),'utf8');
  assert.match(missing, /src="\/blog\/pending-article.js"/);
  assert.match(missing, /href="\/blog\/index.html"/);
  assert.match(index, /posts\/hello-world\.html/);
  assert.match(index, /editor\.html/);
  assert.match(feed, /https:\/\/example\.test\/blog\/posts\/hello-world\.html/);
  assert.match(sitemap, /https:\/\/example\.test\/blog\/posts\/hello-world\.html/);
  assert.equal(publicPosts.length, 1);
  assert.equal(publicPosts[0].markdown, '# Hello');
});

test('excludes drafts from every public output', async (t) => {
  const { outDir } = await fixture(t, {
    public: post(), draft: post({ id: 'draft', slug: 'secret-draft', title: 'Secret', status: 'draft' }),
  });
  for (const file of ['index.html', 'feed.xml', 'sitemap.xml', 'posts.json']) {
    assert.doesNotMatch(await readFile(path.join(outDir, file), 'utf8'), /secret-draft|Secret/);
  }
  await assert.rejects(readFile(path.join(outDir, 'posts', 'secret-draft.html')));
});

test('rejects traversal and noncanonical slugs before writing an article', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-posts-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const postsDir = path.join(root, 'posts');
  await mkdir(postsDir);
  await writeFile(path.join(postsDir, 'bad.json'), JSON.stringify(post({ slug: '../outside' })));
  await assert.rejects(buildPosts({ postsDir, outDir: path.join(root, 'dist') }), /Invalid post slug/);
});

test('preserves safe uploaded images, https media, task lists, and renders math blocks', async (t) => {
  const html = '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="local"></p>' +
    '<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="unsafe">' +
    '<video controls src="https://cdn.example.test/clip.mp4"></video>' +
    '<audio controls src="https://cdn.example.test/audio.mp3"></audio>' +
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"></label><div><p>Done</p></div></li></ul>' +
    '<div data-type="mathBlock" data-latex="x^2 + y^2 = z^2"><p>x^2 + y^2 = z^2</p></div>';
  const { outDir } = await fixture(t, {
    safe: post({ html, cover: 'data:image/webp;base64,UklGRg==', markdown: '' }),
  });
  const article = await readFile(path.join(outDir, 'posts', 'hello-world.html'), 'utf8');
  assert.match(article, /src="data:image\/webp;base64,UklGRg=="/);
  assert.match(article, /src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.doesNotMatch(article, /data:image\/svg\+xml/i);
  assert.match(article, /<video controls src="https:\/\/cdn\.example\.test\/clip\.mp4"><\/video>/);
  assert.match(article, /<audio controls src="https:\/\/cdn\.example\.test\/audio\.mp3"><\/audio>/);
  assert.match(article, /type="checkbox" checked="checked" disabled="disabled"/);
  assert.match(article, /<math[^>]*>/);
  assert.match(article, /<mfrac|<msup/);
});

test('renders markdown content when html is empty and serves Spanish index labels', async (t) => {
  const { outDir } = await fixture(t, {
    markdown: post({ html: '', markdown: '## Una idea\n\nTexto desde Markdown.' }),
  });
  const article = await readFile(path.join(outDir, 'posts', 'hello-world.html'), 'utf8');
  const index = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(article, /<h2>Una idea<\/h2>/);
  assert.match(article, /Texto desde Markdown\./);
  assert.match(article, /lang="es"/);
  assert.match(index, /Artículos/);
  assert.match(index, /Escritura sin prisa\./);
});
