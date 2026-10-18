const dateFormatter=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const image=value=>typeof value==='string'&&(/^(?:https:\/\/|\.\/media\/)/.test(value)||/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value))?value:'';
const icon=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"></path></svg>`;
export function renderFeedCard(post,profile={}){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug||''))throw new Error('Enlace de artículo inválido.');
  const author=profile.author||'Mi blog',avatar=image(profile.avatar),cover=image(post.cover);
  const title=post.title||'Sin título',tags=Array.isArray(post.tags)?post.tags.filter(tag=>typeof tag==='string'):[];
  const date=new Date(post.publishedAt),formatted=Number.isNaN(date.valueOf())?'':dateFormatter.format(date);
  return `<article class="post-card" data-title="${esc(title)}" data-published-at="${esc(post.publishedAt)}"><div class="post-byline"><span class="mini-avatar" data-profile="initial" aria-hidden="true">${avatar?`<img src="${esc(avatar)}" alt="">`:esc(Array.from(author)[0])}</span><strong data-profile="author">${esc(author)}</strong><time datetime="${esc(post.publishedAt)}">${esc(formatted)}</time></div><a class="post-link" href="posts/${encodeURIComponent(post.slug)}.html" aria-label="Leer ${esc(title)}">${cover?`<img class="post-cover" src="${esc(cover)}" alt="" loading="lazy" width="600" height="240">`:''}<div class="post-summary"><h3>${esc(title)}</h3><p>${esc(post.excerpt)}</p>${tags.length?`<div class="post-card-tags">${tags.map(tag=>`<span>#${esc(tag)}</span>`).join('')}</div>`:''}<div class="post-read"><span>${icon('M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0')}${Number.isFinite(post.minutes)?post.minutes:0} min de lectura</span><strong>Leer artículo ${icon('M5 12h14m-5-5 5 5-5 5')}</strong></div></div></a></article>`;
}
