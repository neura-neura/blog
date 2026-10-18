// Remote publications are available even when this browser has no saved drafts.
export function publishedArticles(remote, local) {
  const posts = new Map(remote.map(post => [post.id || post.slug, post]));
  for (const post of local.filter(post => post.status === 'published')) {
    const key = post.id || post.slug;
    const saved = posts.get(key);
    if (!saved || (post.updatedAt || '') >= (saved.updatedAt || '')) posts.set(key, post);
  }
  return [...posts.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function createPublishedLibrary({ listPosts, onChange = () => {} }) {
  let posts = [], loading = false, error = '', request, revision = 0;
  const state = () => ({ posts, loading, error });
  const notify = () => onChange(state());
  return {
    state,
    load() {
      if (request) return request;
      const version = revision;
      loading = true;
      error = '';
      notify();
      request = Promise.resolve().then(listPosts).then(result => {
        if (version === revision) posts = result;
      }).catch(reason => { error = reason.message || 'No se pudieron cargar los artículos.'; })
        .finally(() => { loading = false; request = null; notify(); });
      return request;
    },
    upsert(post) {
      revision++;
      posts = posts.filter(item => item.id !== post.id && item.slug !== post.slug).concat(post);
      notify();
    },
    remove(post) {
      revision++;
      posts = posts.filter(item => item.id !== post.id && item.slug !== post.slug);
      notify();
    },
  };
}
