import test from 'node:test';
import assert from 'node:assert/strict';
import { hasDraftContent, storeDraft } from '../src/drafts.js';

const blank = (id = 'new') => ({ id, title: '', markdown: '', html: '<p></p>', cover: '', status: 'draft' });

test('autosave and reload cannot recreate an empty canvas after deletion', () => {
  let drafts = storeDraft([], blank('deleted'), { explicit: true });
  drafts = drafts.filter(d => d.id !== 'deleted');
  for (let i = 0; i < 5; i++) drafts = storeDraft(drafts, blank());
  assert.deepEqual(drafts, []);
});

test('explicit empty creation persists exactly one draft across repeated saves', () => {
  let drafts = storeDraft([], blank(), { explicit: true });
  for (let i = 0; i < 10; i++) drafts = storeDraft(drafts, blank(), { explicit: true });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, 'new');
});

test('title, body, cover and media-only drafts are preserved', () => {
  for (const extra of [{ title: 'Idea' }, { markdown: 'Texto' }, { cover: 'cover.png' },
    { html: '<p><img src="photo.png"></p>' }, { html: '<hr>' }, { html: '<table><tr><td></td></tr></table>' },
    { html: '<div data-latex="x"></div>' }, { html: '<p>Texto</p>' }]) {
    assert.equal(storeDraft([], { ...blank(), ...extra }).length, 1);
  }
});

test('clearing an existing draft keeps it until explicitly deleted', () => {
  assert.equal(storeDraft([{ ...blank(), title: 'Idea' }], blank()).length, 1);
  assert.equal(hasDraftContent({ ...blank(), html: '<p><br></p><p>&nbsp; </p>' }), false);
});
