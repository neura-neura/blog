import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublishedLibrary, publishedArticles } from '../src/published-posts.js';

const post = { id: 'one', slug: 'first', title: 'Published article', status: 'published', updatedAt: '2026-10-17T12:00:00Z' };

test('a clean browser and a reload both recover publications from GitHub', async () => {
  for (let reload = 0; reload < 2; reload++) {
    const states = [];
    const library = createPublishedLibrary({ listPosts: async () => [post], onChange: state => states.push(state) });
    await library.load();
    assert.equal(states[0].loading, true);
    assert.deepEqual(publishedArticles(library.state().posts, []), [post]);
    assert.equal(library.state().loading, false);
  }
});

test('refresh preserves newer local edits and prefers newer remote versions without duplicates', () => {
  const edited = { ...post, title: 'Unsaved changes', updatedAt: '2026-10-17T13:00:00Z' };
  assert.deepEqual(publishedArticles([post], [edited]), [edited]);
  assert.deepEqual(publishedArticles([edited], [post]), [edited]);
  assert.deepEqual(publishedArticles([post], [{ ...post, id: 'draft', status: 'draft' }]), [post]);
});

test('failed requests expose an error and retry recovers', async () => {
  let calls = 0;
  const library = createPublishedLibrary({ listPosts: async () => {
    if (++calls === 1) throw Error('Connection failed');
    return [post];
  } });
  await library.load();
  assert.equal(library.state().error, 'Connection failed');
  await library.load();
  assert.equal(library.state().error, '');
  assert.deepEqual(library.state().posts, [post]);
});

test('rapid tab clicks share a request and publishing during refresh cannot be overwritten', async () => {
  let resolve, calls = 0;
  const library = createPublishedLibrary({ listPosts: () => { calls++; return new Promise(done => { resolve = done; }); } });
  const first = library.load();
  assert.equal(library.load(), first);
  await Promise.resolve();
  const updated = { ...post, title: 'Updated' };
  library.upsert(updated);
  resolve([post]);
  await first;
  assert.equal(calls, 1);
  assert.deepEqual(library.state().posts, [updated]);
  library.remove(updated);
  assert.deepEqual(library.state().posts, []);
});
