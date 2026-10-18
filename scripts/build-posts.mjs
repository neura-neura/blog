import { normalizeProfile } from '../src/profile.js';
import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sanitizeHtml from 'sanitize-html';
import katex from 'katex';
import { marked } from 'marked';
import { readingStats } from '../src/reading-stats.js';
import { renderIndex, uiIcon } from './render-index.mjs';

const DEFAULT_SITE_URL = 'https://neura-neura.github.io/blog-studio';
const allowedTags = [...sanitizeHtml.defaults.allowedTags, 'h1', 'img', 'video', 'audio', 'source', 'input',
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'mfrac', 'msqrt', 'mroot', 'msup', 'msub', 'msubsup', 'munderover', 'mtable', 'mtr', 'mtd'];
const sanitizeOptions = {
  allowedTags,
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    video: ['src', 'controls', 'poster', 'width', 'height', 'preload'],
    audio: ['src', 'controls', 'preload'],
    source: ['src', 'type'],
    input: ['type', 'checked', 'disabled'],
    math: ['xmlns', 'display'],
    annotation: ['encoding'],
    mi: ['mathvariant'],
    mo: ['stretchy', 'fence', 'separator', 'lspace', 'rspace', 'accent', 'accentunder'],
    mspace: ['width'],
    mtable: ['columnalign', 'rowspacing', 'columnspacing'],
    mtr: ['columnalign'],
    mtd: ['columnalign'],
    msub: ['subscriptshift'],
    msup: ['superscriptshift'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'], video: ['https'], audio: ['https'], source: ['https'] },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const validSlug = (slug) => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
const cleanSiteUrl = (siteUrl) => String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
const safeImageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim() || /[\\\u0000-\u001f]/.test(value)) return '';
  const url = value.trim();
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(url)) return url;
  if (/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(url) && !url.startsWith('//')) return url;
  return '';
};
const safeMediaUrl = (value) => typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(value.trim()) ? value.trim() : '';
const decodeAttribute = (value) => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function renderBody(post) {
  const source = String(post.html || (post.markdown ? marked.parse(String(post.markdown)) : ''));
  const math = [];
  const withMathTokens = source.replace(/<div\b(?=[^>]*\bdata-latex\s*=\s*(["'])(.*?)\1)[^>]*>[\s\S]*?<\/div\s*>/gi, (_match, _quote, latex) => {
    const token = `MATHBLOCKTOKEN${math.length}END`;
    try {
      math.push(katex.renderToString(decodeAttribute(latex), { displayMode: true, output: 'mathml', throwOnError: false }));
    } catch {
      math.push(`<div class="math-error">${escapeHtml(decodeAttribute(latex))}</div>`);
    }
    return token;
  });
  let body = sanitizeHtml(withMathTokens, {
    ...sanitizeOptions,
    transformTags: {
      ...sanitizeOptions.transformTags,
      img: (_tagName, attribs) => ({ tagName: 'img', attribs: { ...attribs, src: safeImageUrl(attribs.src) } }),
      video: (_tagName, attribs) => ({ tagName: 'video', attribs: { ...attribs, src: safeMediaUrl(attribs.src), poster: safeImageUrl(attribs.poster) } }),
      audio: (_tagName, attribs) => ({ tagName: 'audio', attribs: { ...attribs, src: safeMediaUrl(attribs.src) } }),
      source: (_tagName, attribs) => ({ tagName: 'source', attribs: { ...attribs, src: safeMediaUrl(attribs.src) } }),
      input: (_tagName, attribs) => attribs.type === 'checkbox' ? ({ tagName: 'input', attribs: { type: 'checkbox', ...(attribs.checked !== undefined ? { checked: 'checked' } : {}), disabled: 'disabled' } }) : ({ tagName: 'span', attribs: {} }),
    },
  });
  math.forEach((markup, index) => { body = body.replace(`MATHBLOCKTOKEN${index}END`, markup); });
  return body;
}
const dateLabel = (date) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? '' : parsed.toISOString().slice(0, 10);
};

function renderArticle(post, canonical) {
  const title = escapeHtml(post.title || 'Untitled');
  const excerpt = escapeHtml(post.excerpt || '');
  const author = escapeHtml(post.author || '');
  const date = dateLabel(post.publishedAt);
  const coverUrl = safeImageUrl(post.cover);
  const cover = coverUrl ? `<img class="cover" src="${escapeHtml(coverUrl)}" alt="${title}" loading="lazy">` : '';
  const tags = Array.isArray(post.tags) ? post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('') : '';
  const body = renderBody(post);
  const plainText = decodeAttribute(sanitizeHtml(String(post.html || marked.parse(post.markdown || '')).replace(/<[^>]+>/g, ' '), {allowedTags: [], allowedAttributes: {}}));
  const { minutes } = readingStats(plainText);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - Artículos</title><meta name="description" content="${excerpt}"><meta name="reading-time" content="${minutes}"><meta name="article-version" content="${escapeHtml(post.updatedAt||post.publishedAt||'')}"><link rel="canonical" href="${escapeHtml(canonical)}">
<style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-font-smoothing:antialiased}body{margin:0;color:#171717;background:#fff;font:17px/28px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}.wrap{max-width:720px;margin:0 auto;padding:32px 24px 80px}header{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:18px}a{color:inherit}header a{text-decoration:none;font-weight:700}.back{color:#666}article{padding-top:46px;overflow-wrap:anywhere}h1{font-size:34px;font-weight:800;line-height:44px;letter-spacing:normal;margin:12px 0 20px}.meta{color:#777;font-size:14px}.excerpt{font-size:1.2rem;color:#555}.cover{display:block;width:100%;aspect-ratio:5/2;height:auto;object-fit:cover;object-position:center;border-radius:0;margin:22px 0}article img:not(.cover){max-width:100%;height:auto}article a{text-underline-offset:3px}article main h1{font-size:32px;line-height:40px;font-weight:700}article main h2{font-size:26px}article main h3{font-size:21px}article h2,article h3{line-height:1.25;letter-spacing:normal;margin-top:1.7em}article pre,article table{display:block;max-width:100%;overflow-x:auto}article pre{padding:16px;background:#f5f5f5;border-radius:8px;font-size:14px}article blockquote{border-left:3px solid #ddd;margin-left:0;padding-left:20px;color:#666}article video{max-width:100%;height:auto}article audio{max-width:100%}.katex-display{text-align:center;overflow-x:auto;padding:8px 0}.tags{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.tags span{background:#f3f3f3;border-radius:99px;padding:3px 10px;font-size:13px;color:#555}footer{border-top:1px solid #eee;margin-top:56px;padding-top:20px;color:#777;font-size:14px}</style><link rel="icon" type="image/svg+xml" href="../favicon.svg"><link rel="stylesheet" href="../appearance.css"><link rel="stylesheet" href="../blog.css"><script type="module" src="../reader-appearance.js"></script></head>
<body><div class="wrap"><header class="reader-topbar"><a class="reader-back" href="../index.html">${uiIcon('back')}Todos los artículos</a><a class="reader-write" href="../editor.html" aria-label="Escribir un artículo">${uiIcon('pen')}<span>Escribir</span></a></header><article>${cover}<p class="meta">${minutes} min de lectura &middot; ${date}${author ? ` · <span data-profile="author">${author}</span>` : ''}</p><h1>${title}</h1>${excerpt ? `<p class="excerpt">${excerpt}</p>` : ''}<div class="tags">${tags}</div><main>${body}</main></article><footer><a class="author-card" href="../index.html"><span class="reader-avatar" data-profile="initial" aria-hidden="true">${escapeHtml(Array.from(post.author||'')[0]||'')}</span><span><strong data-profile="author">${author}</strong><span class="reader-handle">@<span data-profile="handle">${escapeHtml(post.authorHandle||'')}</span></span></span></a><p data-profile="bio">${escapeHtml(post.authorBio||'')}</p><a href="../editor.html">Escribir</a> · <a href="../feed.xml">RSS</a></footer></div></body></html>`;
}

function renderFeed(posts, siteUrl, profile) {
  const items = posts.map((post) => `<item><title>${escapeHtml(post.title || 'Untitled')}</title><link>${escapeHtml(`${siteUrl}/posts/${encodeURIComponent(post.slug)}.html`)}</link><guid>${escapeHtml(`${siteUrl}/posts/${encodeURIComponent(post.slug)}.html`)}</guid><description>${escapeHtml(post.excerpt || '')}</description><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(profile.author)} · Artículos</title><link>${escapeHtml(`${siteUrl}/`)}</link><description>${escapeHtml(profile.bio)}</description>${items}</channel></rss>`;
}

export async function buildPosts({ postsDir = 'posts', outDir = 'dist', siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL } = {}) {
  const root = path.resolve(postsDir);
  const output = path.resolve(outDir);
  const base = cleanSiteUrl(siteUrl);
  const files = (await readdir(root)).filter((file) => file.endsWith('.json')).sort();
  const posts = [];
  for (const file of files) {
    const post = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    if (post.status !== 'published') continue;
    if (!validSlug(post.slug)) throw new Error(`Invalid post slug in ${file}`);
    posts.push(post);
  }
  posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  let savedProfile={};
  try { savedProfile=JSON.parse(await readFile(path.resolve(root,'../blog-profile.json'),'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
  const profile=normalizeProfile({author:posts[0]?.author||'Mi blog',bio:posts[0]?.authorBio||'',handle:new URL(base).hostname.split('.')[0],...savedProfile});
  for(const post of posts)Object.assign(post,{author:profile.author,authorBio:profile.bio,authorHandle:profile.handle});
  await mkdir(path.join(output, 'posts'), { recursive: true });
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
  await Promise.all(['appearance.js','appearance.css','pending-article.js','blog.css','blog-index.js','profile.js'].map(file => copyFile(path.join(sourceRoot,file),path.join(output,file))));
  await copyFile(path.resolve(sourceRoot,'../public/favicon.svg'),path.join(output,'favicon.svg'));
  await writeFile(path.join(output,'profile.json'),JSON.stringify(profile,null,2),'utf8');
  await writeFile(path.join(output,'reader-appearance.js'), "import { initAppearance } from './appearance.js';\ninitAppearance();\nimport { initProfile } from './profile.js';\ninitProfile({baseUrl:new URL('./',import.meta.url)});\n");
  await Promise.all(posts.map((post) => writeFile(path.join(output, 'posts', `${post.slug}.html`), renderArticle(post, `${base}/posts/${encodeURIComponent(post.slug)}.html`), 'utf8')));
  await writeFile(path.join(output, 'index.html'), renderIndex(posts,{profile,siteUrl:base,escapeHtml,safeImageUrl,plainText:post=>decodeAttribute(sanitizeHtml(String(post.html||marked.parse(post.markdown||'')).replace(/<[^>]+>/g,' '),{allowedTags:[],allowedAttributes:{}})).replace(/\s+/g,' ').trim()}), 'utf8');
  const sitePath=new URL(base).pathname.replace(/\/$/,'');
  await writeFile(path.join(output,'404.html'),`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Artículo · Blog Studio</title><link rel="icon" type="image/svg+xml" href="${sitePath}/favicon.svg"><link rel="stylesheet" href="${sitePath}/appearance.css"><script type="module" src="${sitePath}/pending-article.js"></script><style>body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}.waiting{max-width:520px;margin:15vh auto;padding:32px}h1{font-size:26px;line-height:32px}p{color:var(--muted)}.home{display:inline-flex;padding:10px 20px;border-radius:99px;background:var(--blue,#1d9bf0);color:#fff;text-decoration:none;font-weight:700}</style></head><body><main class="waiting"><h1 id="pending-title">No encontramos esta página</h1><p id="pending-message">Comprueba el enlace o vuelve al blog.</p><a class="home" href="${sitePath}/index.html">Volver al blog</a></main></body></html>`,'utf8');

  await writeFile(path.join(output, 'feed.xml'), renderFeed(posts, base, profile), 'utf8');
  const publicPosts = posts.map(({ id, slug, title, markdown, html, cover, author, authorBio, authorHandle, excerpt, tags, publishedAt, updatedAt }) => ({ id, slug, title, markdown, html, cover, author, authorBio, authorHandle, excerpt, tags, publishedAt, updatedAt }));
  await writeFile(path.join(output, 'posts.json'), JSON.stringify(publicPosts, null, 2), 'utf8');
  const urls = [`${base}/`, ...posts.map((post) => `${base}/posts/${encodeURIComponent(post.slug)}.html`)];
  await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeHtml(url)}</loc></url>`).join('')}</urlset>`, 'utf8');
  await writeFile(path.join(output, '.nojekyll'), '', 'utf8');
  return { posts: posts.length, outDir: output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  buildPosts().then(({ posts }) => console.log(`Built ${posts} published post(s).`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
