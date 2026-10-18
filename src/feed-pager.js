// Result handles are cheap; fetch article data only for the visible batch.
export function createFeedPager({ search, pageSize = 20, initialCount = 0, total = 0 } = {}) {
  let revision = 0, results = null, cursor = initialCount, count = total, busy = false;
  let query = '', order = 'newest';
  const state = () => ({ count, loaded: cursor, more: cursor < count, busy });
  async function next() {
    if (busy || cursor >= count) return null;
    const version = revision;
    busy = true;
    try {
      if (!results) {
        const found = await search(query, order);
        if (version !== revision) return null;
        results = found.results;
        count = results.length;
      }
      const batch = await Promise.all(results.slice(cursor, cursor + pageSize).map(result => result.data()));
      if (version !== revision) return null;
      cursor += batch.length;
      return batch;
    } finally { if (version === revision) busy = false; }
  }
  return {
    state, next,
    async page(offset) {
      const version=revision;
      if(!results)return null;
      const batch=await Promise.all(results.slice(offset,Math.min(cursor,offset+pageSize)).map(result=>result.data()));
      return version===revision?batch:null;
    },
    async reset(nextQuery = '', nextOrder = 'newest') {
      const version = ++revision;
      query = nextQuery; order = nextOrder; results = null; cursor = 0; count = 0; busy = true;
      try {
        const found = await search(query, order);
        if (version !== revision) return null;
        results = found.results; count = results.length; busy = false;
        if(!count)return [];
        return await next();
      } finally { if (version === revision) busy = false; }
    },
  };
}
