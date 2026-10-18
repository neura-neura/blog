// Public profile only. Connection settings and credentials never enter this object.
export function profileBannerUrl(value) {
  if(typeof value!=='string'||value.length>3*1024*1024)return '';
  const url=value.trim();
  if(/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url))return url;
  try{return new URL(url).protocol==='https:'?new URL(url).href:'';}catch{return '';}
}
export function normalizeProfile(value = {}) {
  const text = (key, limit) => typeof value?.[key] === 'string' ? value[key].trim().slice(0, limit) : '';
  return { author: text('author', 100) || 'Mi blog', bio: text('bio', 500), handle: text('handle', 100).replace(/^@+/, ''), banner:profileBannerUrl(value?.banner), updatedAt: text('updatedAt', 40) };
}

export function applyProfileDOM(doc, value) {
  const profile = normalizeProfile(value);
  for (const node of doc.querySelectorAll('[data-profile]')) {
    const field = node.dataset.profile;
    node.textContent = field === 'initial' ? Array.from(profile.author)[0] : profile[field] || '';
  }
  for(const node of doc.querySelectorAll('[data-profile-banner]')){
    if(!profile.banner){node.replaceChildren();continue;}
    const image=doc.createElement('img');image.src=profile.banner;image.alt='';image.width=600;image.height=200;
    node.replaceChildren(image);
  }
  if (doc.querySelector('[data-profile-title]')) doc.title = `Artículos · ${profile.author}`;
  const description = doc.querySelector('meta[data-profile-description]');
  if (description) description.setAttribute('content', profile.bio);
}

export function initProfile({ win = window, baseUrl = new URL('./', win.location.href), legacy, onChange = () => {}, fetchImpl = win.fetch.bind(win) } = {}) {
  const key = `blog-studio-profile-v1:${new URL(baseUrl).pathname}`;
  let state = null;
  let revision = 0;
  const read = () => { try { const v = JSON.parse(win.localStorage.getItem(key)); return v?.profile ? { profile: normalizeProfile(v.profile), pending: !!v.pending } : null; } catch { return null; } };
  const notify = () => { if (state) { applyProfileDOM(win.document, state.profile); onChange({ ...state.profile }); } };
  const persist = () => { try { win.localStorage.setItem(key, JSON.stringify(state)); } catch { /* Private browsing can disable storage. */ } };
  state = read();
  if (!state && legacy) { state = { profile: normalizeProfile(legacy), pending: true }; persist(); }
  notify();
  async function refresh() {
    const started = revision;
    try {
      const response = await fetchImpl(new URL('profile.json', baseUrl).href, { cache: 'no-store' });
      if (!response.ok) return;
      const raw = await response.json();
      if (typeof raw?.author !== 'string') return;
      const remote = normalizeProfile(raw);
      if (started !== revision || state?.pending) return;
      // An older CDN response must not undo a profile just saved to GitHub.
      if ((Date.parse(remote.updatedAt) || 0) < (Date.parse(state?.profile.updatedAt) || 0)) return;
      state = { profile: remote, pending: false }; persist(); notify();
    } catch { /* Offline pages keep their generated profile or cached edits. */ }
  }
  win.addEventListener('storage', event => { if (event.key === key || event.key === null) { revision++; state = read(); notify(); } });
  win.addEventListener('focus', refresh);
  const ready = refresh();
  return {
    ready, refresh,
    get: () => state ? { ...state.profile } : null,
    pending: () => !!state?.pending,
    set(value) { revision++; state = { profile: normalizeProfile({ ...value, updatedAt: new Date(Math.max(Date.now(), (Date.parse(state?.profile.updatedAt) || 0) + 1)).toISOString() }), pending: true }; persist(); notify(); return { ...state.profile }; },
    markPublished(profile) { if (state?.profile.updatedAt === profile.updatedAt) { state.pending = false; persist(); } },
  };
}
