import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPosts } from '../scripts/build-posts.mjs';
import { renderIndex } from '../scripts/render-index.mjs';

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

test('share metadata uses absolute cover URLs and escaped titles and descriptions',async t=>{
  const {outDir}=await fixture(t,{one:post({title:'Ideas "nuevas" & otras',excerpt:'Una nota <breve>',cover:'../images/cover.webp'})});
  const html=await readFile(path.join(outDir,'posts/hello-world.html'),'utf8');
  assert.match(html,/<meta property="og:title" content="Ideas &quot;nuevas&quot; &amp; otras">/);
  assert.match(html,/<meta property="og:description" content="Una nota &lt;breve&gt;">/);
  assert.match(html,/<meta property="og:url" content="https:\/\/example.test\/blog\/posts\/hello-world.html">/);
  assert.match(html,/<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html,/<meta property="og:image" content="https:\/\/example.test\/blog\/images\/cover.webp">/);
});

test('embedded share covers become fetchable files and body images are a fallback',async t=>{
  const bytes=Buffer.from('cover test bytes');
  const {outDir}=await fixture(t,{one:post({cover:`data:image/png;base64,${bytes.toString('base64')}`}),two:post({slug:'inline',excerpt:'',html:'<p>Texto de muestra.</p><img src="https://example.test/body.webp">'}),three:post({slug:'text-only',excerpt:'',html:'<p>Sin imagen.</p>'})});
  const html=await readFile(path.join(outDir,'posts/hello-world.html'),'utf8');
  const image=/<meta property="og:image" content="([^"]+)">/.exec(html)[1];
  assert.match(image,/^https:\/\/example.test\/blog\/posts\/hello-world-share-[a-f0-9]+\.png$/);
  assert.deepEqual(await readFile(path.join(outDir,'posts',new URL(image).pathname.split('/').pop())),bytes);
  const inline=await readFile(path.join(outDir,'posts/inline.html'),'utf8');
  assert.match(inline,/<meta name="twitter:image" content="https:\/\/example.test\/body.webp">/);
  assert.match(inline,/<meta property="og:description" content="Texto de muestra\.">/);
  const text=await readFile(path.join(outDir,'posts/text-only.html'),'utf8');
  assert.match(text,/<meta name="twitter:card" content="summary">/);
  assert.doesNotMatch(text,/<meta property="og:image"/);
});

test('moving the last public article to unlisted builds without a public posts directory',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'empty-public-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const publicPostsDir=path.join(root,'public','posts');
  const unlistedPostsDir=path.join(root,'unlisted','posts');
  const outDir=path.join(root,'dist');
  await mkdir(unlistedPostsDir,{recursive:true});
  const slug='2642223a-738c-4fcc-a2b2-e4c59c2810d3';
  await writeFile(path.join(unlistedPostsDir,slug+'.json'),JSON.stringify(post({slug,visibility:'unlisted'})));
  const result=await buildPosts({postsDir:publicPostsDir,publicPostsDir,unlistedPostsDir,outDir});
  assert.equal(result.posts,0);
  assert.match(await readFile(path.join(outDir,'posts',slug+'.html'),'utf8'),/article-version/);
  for(const file of ['index.html','posts.json','feed.xml','sitemap.xml'])assert.doesNotMatch(await readFile(path.join(outDir,file),'utf8'),new RegExp(slug));
  await rm(unlistedPostsDir,{recursive:true});
  await buildPosts({postsDir:publicPostsDir,publicPostsDir,unlistedPostsDir,outDir:path.join(root,'empty')});
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'empty','posts.json'),'utf8')),[]);
});

test('100,000 publications produce only 20 cards in the initial home HTML',()=>{
  const posts=Array.from({length:100000},(_,index)=>({slug:`entry-${index}`,title:`Entry ${index}`,publishedAt:'2026-01-01'}));
  const html=renderIndex(posts,{profile:{author:'Writer',bio:'Bio',handle:'writer',website:''},siteUrl:'https://example.test',escapeHtml:String,safeImageUrl:()=>'',plainText:()=> 'Content'});
  assert.equal((html.match(/class="post-card"/g)||[]).length,20);
  assert.match(html,/data-total="100000"/);
  assert.doesNotMatch(html,/Entry 99999/);
  assert.match(html,/id="feed-load-more"/);
});

test('build includes a search index and a bounded initial feed without exposing drafts',async t=>{
  const entries=Object.fromEntries(Array.from({length:45},(_,index)=>[`post-${index}`,post({id:`id-${index}`,slug:`entry-${index}`,title:`Title ${index}`})]));
  entries.draft=post({slug:'secret-draft',status:'draft',title:'Never indexed'});
  const {outDir}=await fixture(t,entries);
  const html=await readFile(path.join(outDir,'index.html'),'utf8');
  assert.equal((html.match(/class="post-card"/g)||[]).length,20);
  assert.match(html,/data-total="45"/);
  assert.doesNotMatch(html,/secret-draft|Never indexed/);
  assert.match(await readFile(path.join(outDir,/data-search-path="\.\/([^"]+)"/.exec(html)[1],'pagefind.js'),'utf8'),/search/);
  assert.match(await readFile(path.join(outDir,'feed-pager.js'),'utf8'),/pageSize = 20/);
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
  assert.deepEqual(publicProfile,{author:profile.author,bio:profile.bio,handle:'nuevo',banner:'',avatar:'',website:'',updatedAt:profile.updatedAt});
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

test('profile avatar and website render on home, cards and article footer before JavaScript',async t=>{
  const avatar='https://example.test/avatar.webp',banner='https://example.test/banner.webp';
  const {outDir}=await fixture(t,{one:post()},{author:'Ada',avatar,banner,website:'https://example.test/about'});
  const index=await readFile(path.join(outDir,'index.html'),'utf8');
  const article=await readFile(path.join(outDir,'posts/hello-world.html'),'utf8');
  assert.equal((index.match(/src="https:\/\/example.test\/avatar.webp"/g)||[]).length,2);
  assert.match(index,/data-profile-banner><img src="https:\/\/example.test\/banner.webp"/);
  assert.match(article,/class="reader-avatar"[^>]*><img src="https:\/\/example.test\/avatar.webp"/);
  for(const page of [index,article])assert.match(page,/href="https:\/\/example.test\/about" target="_blank" rel="noopener noreferrer"/);
  assert.match(article,/<main class="prose">/);
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
  assert.match(index, /data-title="hello &lt;script&gt;/i);
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

test('builds unlisted pages by direct URL while keeping them out of every public listing', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-visibility-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicPostsDir = path.join(root, 'public-posts');
  const unlistedPostsDir = path.join(root, 'unlisted-posts');
  const outDir = path.join(root, 'dist');
  await mkdir(publicPostsDir); await mkdir(unlistedPostsDir);
  await writeFile(path.join(publicPostsDir, 'public.json'), JSON.stringify(post({ id: 'public', slug: 'public-article', title: 'Public article' })));
  // An unlisted record in the public checkout and private records in either checkout must fail closed.
  await writeFile(path.join(publicPostsDir, 'misplaced.json'), JSON.stringify(post({ id: 'misplaced', slug: 'misplaced-secret', title: 'Misplaced secret', visibility: 'unlisted' })));
  await writeFile(path.join(publicPostsDir, 'private.json'), JSON.stringify(post({ id: 'private', slug: 'private-secret', title: 'Private secret', visibility: 'private' })));
  await writeFile(path.join(unlistedPostsDir, 'unlisted.json'), JSON.stringify(post({ id: 'unlisted', slug: 'shared-secret-link', title: 'Unlisted secret', visibility: 'unlisted', cover: 'https://assets.example.test/unlisted-cover-secret.webp', html: '<p>Unlisted body</p><img src="https://assets.example.test/unlisted-inline-secret.webp" alt="Unlisted image">' })));
  await writeFile(path.join(unlistedPostsDir, 'private.json'), JSON.stringify(post({ id: 'private-2', slug: 'second-private-secret', title: 'Second private secret', visibility: 'private' })));
  await buildPosts({ publicPostsDir, unlistedPostsDir, outDir, siteUrl: 'https://example.test/blog' });

  for (const file of ['index.html', 'feed.xml', 'sitemap.xml', 'posts.json']) {
    const content = await readFile(path.join(outDir, file), 'utf8');
    assert.doesNotMatch(content, /shared-secret-link|Unlisted secret|unlisted-cover-secret|unlisted-inline-secret|misplaced-secret|Misplaced secret|private-secret|Private secret|second-private-secret|Second private secret/);
  }
  const publicIndex = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(publicIndex, /public-article/);
  const searchDir = /data-search-path="\.\/([^\"]+)"/.exec(publicIndex)?.[1];
  assert.ok(searchDir);
  const searchFiles = await (await import('node:fs/promises')).readdir(path.join(outDir, searchDir), { recursive: true });
  for (const file of searchFiles.filter(file => typeof file === 'string')) {
    if (!file.endsWith('.json') && !file.endsWith('.js')) continue;
    assert.doesNotMatch(await readFile(path.join(outDir, searchDir, file), 'utf8'), /shared-secret-link|Unlisted secret|unlisted-cover-secret|unlisted-inline-secret|misplaced-secret|Misplaced secret|private-secret|Private secret/);
  }
  const unlisted = await readFile(path.join(outDir, 'posts', 'shared-secret-link.html'), 'utf8');
  assert.match(unlisted, /Unlisted secret/);
  assert.match(unlisted, /unlisted-cover-secret\.webp/);
  assert.match(unlisted, /unlisted-inline-secret\.webp/);
  assert.match(unlisted, /<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.match(unlisted, /<meta property="og:url" content="https:\/\/example.test\/blog\/posts\/shared-secret-link.html">/);
  assert.match(unlisted, /<meta name="twitter:card" content="summary_large_image">/);
  assert.doesNotMatch(unlisted, /misplaced-secret|Private secret|Second private secret/);
  for (const slug of ['misplaced-secret', 'private-secret', 'second-private-secret']) {
    await assert.rejects(readFile(path.join(outDir, 'posts', `${slug}.html`)));
  }
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
