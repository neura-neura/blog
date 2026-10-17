import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sanitizeHtml from 'sanitize-html';
import katex from 'katex';
import { marked } from 'marked';

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
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Artículos</title><meta name="description" content="${excerpt}"><link rel="canonical" href="${escapeHtml(canonical)}">
<style>body{margin:0;color:#171717;background:#fff;font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:720px;margin:0 auto;padding:32px 24px 80px}header{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:18px}a{color:inherit}header a{text-decoration:none;font-weight:700}.back{color:#666}article{padding-top:46px}h1{font-size:36px;line-height:1.15;letter-spacing:-.05em;margin:12px 0 20px}.meta{color:#777;font-size:14px}.excerpt{font-size:1.2rem;color:#555}.cover{width:100%;height:auto;border-radius:12px;margin:22px 0}article img:not(.cover){max-width:100%;height:auto}article a{text-underline-offset:3px}article h2,article h3{line-height:1.25;letter-spacing:-.03em;margin-top:1.7em}article pre,article table{display:block;max-width:100%;overflow-x:auto}article pre{padding:16px;background:#f5f5f5;border-radius:8px;font-size:14px}article blockquote{border-left:3px solid #ddd;margin-left:0;padding-left:20px;color:#666}article video{max-width:100%;height:auto}article audio{max-width:100%}.katex-display{text-align:center;overflow-x:auto;padding:8px 0}.tags{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.tags span{background:#f3f3f3;border-radius:99px;padding:3px 10px;font-size:13px;color:#555}footer{border-top:1px solid #eee;margin-top:56px;padding-top:20px;color:#777;font-size:14px}</style></head>
<body><div class="wrap"><header><a href="../index.html">Artículos</a><a class="back" href="../index.html">Todos los artículos</a></header><article>${cover}<p class="meta">${date}${author ? ` · ${author}` : ''}</p><h1>${title}</h1>${excerpt ? `<p class="excerpt">${excerpt}</p>` : ''}<div class="tags">${tags}</div><main>${body}</main></article><footer><a href="../editor.html">Escribir</a> · <a href="../feed.xml">RSS</a></footer></div></body></html>`;
}

function renderIndex(posts) {
  const rows = posts.map((post) => `<article><p class="date">${escapeHtml(dateLabel(post.publishedAt))}</p><h2><a href="posts/${encodeURIComponent(post.slug)}.html">${escapeHtml(post.title || 'Untitled')}</a></h2>${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}</article>`).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artículos</title><meta name="description" content="Una colección de artículos."><link rel="alternate" type="application/rss+xml" title="RSS de Artículos" href="feed.xml"><style>body{margin:0;color:#171717;background:#fff;font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:720px;margin:auto;padding:40px 24px 80px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding-bottom:24px}header a{color:inherit;text-decoration:none}header strong{font-size:20px;letter-spacing:-.04em}.write{border:1px solid #ddd;border-radius:99px;padding:7px 14px;font-size:14px}h1{font-size:48px;letter-spacing:-.06em;margin:54px 0 8px}.intro{color:#666;margin:0 0 48px}article{padding:24px 0;border-top:1px solid #eee}.date{font-size:13px;color:#888;margin:0 0 8px}h2{font-size:24px;letter-spacing:-.035em;margin:0 0 6px}h2 a{text-decoration:none}h2 a:hover{text-decoration:underline;text-underline-offset:4px}article>p:last-child{color:#666;margin:0}footer{border-top:1px solid #eee;margin-top:40px;padding-top:20px;color:#777;font-size:14px}footer a{color:inherit}</style></head><body><div class="wrap"><header><a href="./index.html"><strong>Artículos</strong></a><a class="write" href="./editor.html">Escribir</a></header><main><h1>Escritura sin prisa.</h1><p class="intro">Ideas, historias y cosas que vale la pena recordar.</p>${rows || '<p>Todavía no hay artículos publicados.</p>'}</main><footer><a href="feed.xml">RSS</a></footer></div></body></html>`;
}

function renderFeed(posts, siteUrl) {
  const items = posts.map((post) => `<item><title>${escapeHtml(post.title || 'Untitled')}</title><link>${escapeHtml(`${siteUrl}/posts/${encodeURIComponent(post.slug)}.html`)}</link><guid>${escapeHtml(`${siteUrl}/posts/${encodeURIComponent(post.slug)}.html`)}</guid><description>${escapeHtml(post.excerpt || '')}</description><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Artículos</title><link>${escapeHtml(`${siteUrl}/`)}</link><description>Ideas, historias y cosas que vale la pena recordar.</description>${items}</channel></rss>`;
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
  await mkdir(path.join(output, 'posts'), { recursive: true });
  await Promise.all(posts.map((post) => writeFile(path.join(output, 'posts', `${post.slug}.html`), renderArticle(post, `${base}/posts/${encodeURIComponent(post.slug)}.html`), 'utf8')));
  await writeFile(path.join(output, 'index.html'), renderIndex(posts), 'utf8');
  await writeFile(path.join(output, 'feed.xml'), renderFeed(posts, base), 'utf8');
  const publicPosts = posts.map(({ id, slug, title, markdown, html, cover, author, excerpt, tags, publishedAt, updatedAt }) => ({ id, slug, title, markdown, html, cover, author, excerpt, tags, publishedAt, updatedAt }));
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
