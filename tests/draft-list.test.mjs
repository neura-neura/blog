import test from 'node:test';
import assert from 'node:assert/strict';
import { draftEntries } from '../src/draft-list.js';
const draft = { id: 'one', title: 'Idea', markdown: 'Texto', status: 'draft', updatedAt: '2026-10-18' };
test('local and private copies are one draft with a storage distinction', () => {
  assert.equal(draftEntries([draft], [draft]).length, 1);
  assert.equal(draftEntries([draft], [draft])[0].storage, 'En este navegador y en la nube');
  assert.equal(draftEntries([draft], [])[0].storage, 'Solo en este navegador');
  assert.equal(draftEntries([], [draft])[0].remoteOnly, true);
});
test('local edits are preserved and the older private snapshot is identified', () => {
  const edited = { ...draft, markdown: 'Cambios' };
  const [entry] = draftEntries([edited], [draft]);
  assert.equal(entry.draft.markdown, 'Cambios');
  assert.equal(entry.storage, 'Cambios locales · versión anterior en la nube');
  assert.equal(entry.remoteOnly, false);
});
test('published articles are excluded even when a private snapshot exists', () => {
  assert.deepEqual(draftEntries([{ ...draft, status: 'published' }], [{...draft,privateSavedAt:'2026-10-18'}],undefined,[{...draft,status:'published',updatedAt:'2026-10-19'}]), []);
  assert.equal(draftEntries([], [{ ...draft, originalStatus: 'published' }])[0].remoteOnly,true);
});
