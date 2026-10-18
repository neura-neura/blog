import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPosts } from '../scripts/build-posts.mjs';

async function fixture(t, entries, profile) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-posts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const postsDir = path.join(root, 'posts');
  const outDir = path.join(root, 'dist');
  await mkdir(postsDir);
  if(profile)await writeFile(path.join(root,'blog-profile.json'),JSON.stringify(profile));
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

test('inline image captions and ALT survive publication while crop originals stay private', async t => {
  const { outDir } = await fixture(t, { one: post({ html: '<figure data-body-image="true" data-original-src="private-original" data-image-crop="private-crop"><img src="https://example.test/cropped.webp" alt="A view &amp; sky"><figcaption>A caption &amp; details</figcaption></figure>' }) });
  const article = await readFile(path.join(outDir, 'posts/hello-world.html'), 'utf8');
  assert.match(article, /<figure><img src="https:\/\/example.test\/cropped.webp" alt="A view &amp; sky" \/><figcaption>A caption &amp; details<\/figcaption><\/figure>/);
  assert.doesNotMatch(article, /private-original|private-crop/);
});

test('one public profile overrides stale authors throughout existing posts, home and RSS', async t => {
  const profile={author:'Nuevo <nombre>',bio:'Presentación & ideas',handle:'@nuevo',updatedAt:'2026-01-01T00:00:00Z',token:'private-secret',repo:'private-repo'};
  const {outDir}=await fixture(t,{one:post({author:'Autor anterior',authorBio:'Bio anterior'}),two:post({id:'two',slug:'second',author:'Otro anterior'})},profile);
  for(const file of ['index.html','posts/hello-world.html','posts/second.html','feed.xml']){
    const html=await readFile(path.join(outDir,file),'utf8');
    assert.match(html,/Nuevo &lt;nombre&gt;/);assert.match(html,/Presentación &amp; ideas/);
    assert.doesNotMatch(html,/Autor anterior|Otro anterior|Bio anterior|private-secret|private-repo/);
  }
  const publicProfile=JSON.parse(await readFile(path.join(outDir,'profile.json'),'utf8'));
  assert.deepEqual(publicProfile,{author:profile.author,bio:profile.bio,handle:'nuevo',banner:'',updatedAt:profile.updatedAt});
  const posts=JSON.parse(await readFile(path.join(outDir,'posts.json'),'utf8'));
  assert.ok(posts.every(p=>p.author===profile.author&&p.authorBio===profile.bio&&p.authorHandle==='nuevo'));
  const reader=await readFile(path.join(outDir,'reader-appearance.js'),'utf8');
  assert.match(reader,/baseUrl:new URL\('\.\/',import.meta.url\)/,'articles must fetch the profile from the site root');
});

test('blog banner is independent from article covers and stays neutral unless configured',async t=>{
  const cover='https://example.test/article.webp';
  const empty=await fixture(t,{one:post({cover})});
  const emptyIndex=await readFile(path.join(empty.outDir,'index.html'),'utf8');
  assert.match(emptyIndex,/<div class="profile-banner" data-profile-banner><\/div>/);
  assert.match(emptyIndex,/class="post-cover" src="https:\/\/example.test\/article.webp"/);
  const banner='https://example.test/profile.webp';
  const configured=await fixture(t,{one:post({cover})},{author:'Ada',banner});
  const index=await readFile(path.join(configured.outDir,'index.html'),'utf8');
  assert.match(index,/<div class="profile-banner" data-profile-banner><img src="https:\/\/example.test\/profile.webp"/);
  assert.match(index,/class="post-cover" src="https:\/\/example.test\/article.webp"/);
  const article=await readFile(path.join(configured.outDir,'posts/hello-world.html'),'utf8');
  assert.match(article,/src="https:\/\/example.test\/article.webp"/);
  assert.doesNotMatch(article,/src="https:\/\/example.test\/profile.webp"/);
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
  assert.doesNotMatch(article, /href="[^"]*editor\.html"/);
  assert.match(article, /<meta name="article-version" content="2025-01-03T00:00:00Z">/);
  assert.match(article, /aspect-ratio:5\/2;height:auto;object-fit:cover;object-position:center/);
  const missing = await readFile(path.join(outDir,'404.html'),'utf8');
  assert.match(missing, /src="\/blog\/pending-article.js"/);
  assert.match(missing, /href="\/blog\/index.html"/);
  assert.match(index, /posts\/hello-world\.html/);
  assert.doesNotMatch(index, /href="[^"]*editor\.html"/);
  assert.match(index, /href="\.\/favicon.svg"/);
  assert.match(article, /href="\.\.\/favicon.svg"/);
  assert.match(missing, /href="\/blog\/favicon.svg"/);
  assert.match(await readFile(path.join(outDir, 'favicon.svg'), 'utf8'), /viewBox="0 0 64 64"/);
  const header = article.match(/<header class="reader-topbar">(.*?)<\/header>/s)[1];
  assert.equal((header.match(/href="\.\.\/index.html"/g) || []).length, 1);
  assert.equal((header.match(/href="\.\.\/editor.html"/g) || []).length, 0);
  assert.match(index, /data-search="hello &lt;script&gt;/i);
  assert.doesNotMatch(index, /<script>alert|onclick=|javascript:/i);
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
  assert.match(index, /class="post-card"/);
  assert.match(index, /Buscar en este blog/);
});
